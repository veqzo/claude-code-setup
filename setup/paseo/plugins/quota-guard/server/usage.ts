// Parsers for usage reports and limit messages. Pure and dependency-free so
// `node --test` runs them directly.
import type { Usage } from "./policy.ts";

const FIVE_HOURS = 5 * 3600;
const WEEK = 7 * 86400;

export function unknownUsage(error: string | null, fetchedAt: string | null = null): Usage {
  return { fiveHourPct: null, weeklyPct: null, resetsAt: null, fetchedAt, estimate: true, limitUntil: null, error };
}

interface Window {
  kind: "fiveHour" | "weekly";
  usedPct: number;
  resetsAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarize(windows: Window[], fetchedAt: string): Usage {
  const worst = (kind: Window["kind"]) =>
    windows.filter((window) => window.kind === kind).sort((a, b) => b.usedPct - a.usedPct)[0];
  const five = worst("fiveHour");
  const week = worst("weekly");
  const resets = [five, week]
    .filter((window): window is Window => window !== undefined && window.resetsAt !== null)
    .sort((a, b) => b.usedPct - a.usedPct);
  return {
    fiveHourPct: five?.usedPct ?? null,
    weeklyPct: week?.usedPct ?? null,
    resetsAt: resets[0]?.resetsAt ?? null,
    fetchedAt,
    estimate: false,
    limitUntil: null,
    error: null,
  };
}

/**
 * Parses `agy -p /usage --output-format json`. Only model groups whose name
 * matches `groups` count (all groups when none match). Inside them the bucket
 * with the highest use wins, because one exhausted bucket already stops the
 * agents that use it.
 */
export function parseAgyUsage(stdout: string, fetchedAt: string, groups = "gemini"): Usage {
  let data: unknown;
  try {
    data = JSON.parse(stdout);
  } catch {
    return unknownUsage("agy returned no JSON", fetchedAt);
  }
  if (!isRecord(data)) return unknownUsage("agy returned an unexpected format", fetchedAt);
  if (data.status !== "SUCCESS") {
    const detail = typeof data.error === "string" ? data.error : `status ${String(data.status)}`;
    return unknownUsage(`agy usage failed: ${detail.slice(0, 200)}`, fetchedAt);
  }
  const command = isRecord(data.command) ? data.command : null;
  const reported = command && isRecord(command.data) ? command.data.groups : null;
  if (command?.name !== "usage" || !Array.isArray(reported)) {
    return unknownUsage("agy returned no usage groups", fetchedAt);
  }
  const named = reported.filter(
    (group): group is Record<string, unknown> => isRecord(group) && Array.isArray(group.buckets),
  );
  const filter = groups.toLowerCase();
  const matching = named.filter((group) => typeof group.name === "string" && group.name.toLowerCase().includes(filter));
  const windows: Window[] = [];
  for (const group of matching.length > 0 ? matching : named) {
    if (!Array.isArray(group.buckets)) continue;
    for (const bucket of group.buckets) {
      if (!isRecord(bucket) || bucket.disabled === true) continue;
      if (typeof bucket.remaining_fraction !== "number") continue;
      const window = typeof bucket.window === "string" ? bucket.window.trim().toLowerCase() : "";
      const kind = window === "5h" ? "fiveHour" : window === "weekly" ? "weekly" : null;
      if (!kind) continue;
      windows.push({
        kind,
        usedPct: Math.min(100, Math.max(0, (1 - bucket.remaining_fraction) * 100)),
        resetsAt: typeof bucket.reset_time === "string" ? bucket.reset_time : null,
      });
    }
  }
  if (windows.length === 0) return unknownUsage("agy reported no 5h or weekly quota", fetchedAt);
  return summarize(windows, fetchedAt);
}

function windowKind(window: Record<string, unknown>): Window["kind"] | null {
  if (window.durationSeconds === FIVE_HOURS) return "fiveHour";
  if (window.durationSeconds === WEEK) return "weekly";
  const name = `${String(window.id ?? "")} ${String(window.label ?? "")}`.toLowerCase();
  if (/five_hour|\b5h\b|session/.test(name)) return "fiveHour";
  if (/seven_day|weekly|\bweek\b/.test(name)) return "weekly";
  return null;
}

/** Picks the Claude entry from `paseo.providers.listUsage()` (Paseo 0.17.5 payload). */
export function parseClaudeUsage(payload: unknown, fetchedAt: string): Usage {
  const providers = isRecord(payload) && Array.isArray(payload.providers) ? payload.providers : [];
  const claude = providers.find((entry) => isRecord(entry) && entry.providerId === "claude");
  if (!isRecord(claude)) return unknownUsage("Paseo reported no Claude usage", fetchedAt);
  if (claude.status !== "available") {
    const detail = typeof claude.error === "string" ? claude.error : String(claude.status);
    return unknownUsage(`Claude usage ${detail.slice(0, 200)}`, fetchedAt);
  }
  const reported = typeof claude.fetchedAt === "string" ? claude.fetchedAt : fetchedAt;
  const windows: Window[] = [];
  for (const window of Array.isArray(claude.windows) ? claude.windows : []) {
    if (!isRecord(window)) continue;
    const kind = windowKind(window);
    const used =
      typeof window.usedPct === "number"
        ? window.usedPct
        : typeof window.remainingPct === "number"
          ? 100 - window.remainingPct
          : null;
    if (!kind || used === null) continue;
    windows.push({ kind, usedPct: used, resetsAt: typeof window.resetsAt === "string" ? window.resetsAt : null });
  }
  if (windows.length === 0) return unknownUsage("Claude usage has no 5h or weekly window", reported);
  return summarize(windows, reported);
}

// Text that Claude Code and agy print when an account is out of quota. Short,
// rate-limit style retries (HTTP 429 with a quick retry) do not match.
const CLAUDE_LIMIT = /usage limit reached|hit your (?:usage |session |weekly )?limit|(?:5-hour|session|weekly|opus) limit reached|out of extra usage/i;
const GEMINI_LIMIT = /RESOURCE_EXHAUSTED|quota (?:exceeded|exhausted)|exhausted your (?:capacity|quota)|individual quota/i;

export function isLimitMessage(provider: string, text: string): boolean {
  if (provider === "claude") return CLAUDE_LIMIT.test(text);
  if (provider === "antigravity") return GEMINI_LIMIT.test(text);
  return false;
}

/**
 * Marks usage as capped after a limit message. The reset time comes from the
 * last report when it lies in the future; otherwise one hour is a guess, and
 * the usage is flagged as an estimate.
 */
export function markLimited(usage: Usage | undefined, now: Date): Usage {
  const base = usage ?? unknownUsage(null);
  const reported = base.resetsAt && Date.parse(base.resetsAt) > now.getTime() ? base.resetsAt : null;
  return {
    ...base,
    limitUntil: reported ?? new Date(now.getTime() + 3600_000).toISOString(),
    estimate: true,
  };
}

/** Old reports stay usable but are flagged, so the UI can label them. */
export function withAge(usage: Usage, now: Date, maxAgeMs: number): Usage {
  if (!usage.fetchedAt || usage.estimate) return usage;
  return now.getTime() - Date.parse(usage.fetchedAt) > maxAgeMs ? { ...usage, estimate: true } : usage;
}
