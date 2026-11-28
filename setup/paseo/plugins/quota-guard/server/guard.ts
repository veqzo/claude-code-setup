import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execCommand, type PluginHandlerContext } from "@getpaseo/plugin/server";
import type { z } from "zod";
import type { guardSettings } from "../shared/settings.ts";
import type { GuardStatus } from "../shared/rpc.ts";
import { accountEnv, overCap, type Account, type HostEnv, type PolicySettings, type Usage } from "./policy.ts";
import { parseAgyUsage, parseClaudeUsage, unknownUsage, withAge } from "./usage.ts";

export type Settings = z.output<typeof guardSettings.schema>;

const AGY_TIMEOUT_MS = 20_000;
// From the daemon environment, not from settings: a settings value would let any
// client of the host choose the program that runs here.
const AGY_COMMAND = process.env.AGY_COMMAND?.trim() || "agy";
const CLAUDE_TIMEOUT_MS = 5_000;

export function resolveHome(home: string, realHome: string = os.homedir()): string {
  if (home === "~") return realHome;
  if (home.startsWith("~/") || home.startsWith("~\\")) return path.join(realHome, home.slice(2));
  return path.resolve(home);
}

export function hostEnv(): HostEnv {
  const realHome = os.homedir();
  const gitConfigPath = path.join(realHome, ".gitconfig");
  return {
    realHome,
    windows: process.platform === "win32",
    gitConfig: fs.existsSync(gitConfigPath) ? gitConfigPath : null,
  };
}

export function homeError(home: string, realHome: string): string | null {
  const resolvedHome = path.resolve(home);
  const resolvedReal = path.resolve(realHome);
  if (path.relative(resolvedReal, resolvedHome) === "") return null;
  const base = path.join(resolvedReal, ".agy-homes");
  const rel = path.relative(base, resolvedHome);
  if (!rel || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    return "agy home must be ~ or inside ~/.agy-homes";
  }
  try {
    if (!fs.statSync(resolvedHome).isDirectory()) {
      return "agy home is missing. Run scripts/setup/agy-homes.js";
    }
  } catch {
    return "agy home is missing. Run scripts/setup/agy-homes.js";
  }
  return null;
}

export function policySettings(settings: Settings): PolicySettings {
  const realHome = os.homedir();
  return {
    activeAccount: settings.activeAccount,
    accounts: settings.accounts.map((entry) => {
      const home = resolveHome(entry.home, realHome);
      return { ...entry, home, homeError: homeError(home, realHome) };
    }),
    caps: settings.caps,
    fallback: settings.fallback,
  };
}

/** A limit message stays in force until it expires, even if a newer report looks fine. */
function keepLimit(next: Usage, previous: Usage | undefined, now: Date): Usage {
  const until = previous?.limitUntil;
  if (!until || Date.parse(until) <= now.getTime()) return next;
  return { ...next, limitUntil: until, estimate: true };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function stdoutOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("stdout" in error)) return null;
  return typeof error.stdout === "string" && error.stdout.trim() ? error.stdout : null;
}

/** Holds the last usage per Google account and for Claude. One instance per plugin process. */
export class Guard {
  gemini: Record<string, Usage> = {};
  claude: Usage | undefined;
  private geminiPoll: Promise<void> | null = null;

  async readAccount(account: Account, settings: Settings): Promise<Usage> {
    const fetchedAt = new Date().toISOString();
    if (account.homeError) return unknownUsage(account.homeError, fetchedAt);
    // execCommand replaces the environment, so start from the daemon's own.
    const env = { ...process.env, ...accountEnv(account, hostEnv()) };
    const groups = settings.geminiUsageGroups;
    try {
      const { stdout } = await execCommand(AGY_COMMAND, ["-p", "/usage", "--output-format", "json"], {
        cwd: account.home,
        env,
        timeout: AGY_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      });
      return parseAgyUsage(stdout, fetchedAt, groups);
    } catch (error) {
      // agy can exit non-zero and still print a JSON status, e.g. when signed out.
      const stdout = stdoutOf(error);
      if (stdout) return parseAgyUsage(stdout, fetchedAt, groups);
      return unknownUsage("agy usage command failed or timed out. Check that this account is signed in.", fetchedAt);
    }
  }

  /** Polls every account. Concurrent callers share one run. */
  pollGemini(settings: Settings): Promise<void> {
    if (this.geminiPoll) return this.geminiPoll;
    const run = async () => {
      const accounts = policySettings(settings).accounts;
      const results = await Promise.all(accounts.map((account) => this.readAccount(account, settings)));
      const now = new Date();
      const next: Record<string, Usage> = {};
      accounts.forEach((account, index) => {
        next[account.id] = keepLimit(results[index], this.gemini[account.id], now);
      });
      this.gemini = next;
    };
    this.geminiPoll = run().finally(() => {
      this.geminiPoll = null;
    });
    return this.geminiPoll;
  }

  async pollClaude(paseo: PluginHandlerContext["paseo"]): Promise<void> {
    const fetchedAt = new Date().toISOString();
    let next: Usage;
    try {
      next = parseClaudeUsage(await withTimeout(paseo.providers.listUsage(), CLAUDE_TIMEOUT_MS, "Claude usage"), fetchedAt);
    } catch (error) {
      next = unknownUsage(error instanceof Error ? error.message.slice(0, 200) : "Claude usage failed", fetchedAt);
    }
    // Keep the last good numbers when a refresh fails, but flag them.
    if (next.error && this.claude && !this.claude.error) next = { ...this.claude, estimate: true };
    this.claude = keepLimit(next, this.claude, new Date());
  }

  /** True when the Claude numbers are missing or older than one poll interval. */
  claudeStale(settings: Settings, now: Date): boolean {
    if (!this.claude?.fetchedAt) return true;
    return now.getTime() - Date.parse(this.claude.fetchedAt) > settings.pollSeconds * 1000;
  }

  /** Usage as the policy sees it: reports older than two intervals count as estimates. */
  snapshot(settings: Settings, now: Date): { gemini: Record<string, Usage>; claude: Usage | undefined } {
    const maxAge = settings.pollSeconds * 2000;
    const gemini: Record<string, Usage> = {};
    for (const [id, usage] of Object.entries(this.gemini)) gemini[id] = withAge(usage, now, maxAge);
    return { gemini, claude: this.claude ? withAge(this.claude, now, maxAge) : undefined };
  }

  status(settings: Settings, now: Date = new Date()): GuardStatus {
    const policy = policySettings(settings);
    const { gemini, claude } = this.snapshot(settings, now);
    return {
      activeAccount: policy.activeAccount,
      accounts: policy.accounts.map((account) => ({
        id: account.id,
        label: account.label,
        over: overCap(gemini[account.id], account.caps ?? policy.caps.gemini, now),
        usage: gemini[account.id] ?? null,
      })),
      claude: { over: overCap(claude, policy.caps.claude, now), usage: claude ?? null },
    };
  }
}
