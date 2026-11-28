// Pure routing logic for new agents. No I/O, no SDK imports, so `node --test`
// runs it directly with type stripping.

/** Usage of one account or provider. Percent values are 0-100; null means unknown. */
export interface Usage {
  fiveHourPct: number | null;
  weeklyPct: number | null;
  /** Earliest reset of a window that is over its cap, ISO 8601. */
  resetsAt: string | null;
  /** When Paseo or agy reported these numbers, ISO 8601. */
  fetchedAt: string | null;
  /** True when the numbers are old or derived from a limit message, not a fresh report. */
  estimate: boolean;
  /** Set when an agent reported a limit message. Treated as capped until this time. */
  limitUntil: string | null;
  error: string | null;
}

export interface Caps {
  fiveHourPct: number;
  weeklyPct: number;
}

export interface HostEnv {
  realHome: string;
  windows: boolean;
  gitConfig: string | null;
}

export interface Account {
  id: string;
  label: string;
  /** Absolute HOME directory for agy of this account. */
  home: string;
  caps?: Caps;
  homeError?: string | null;
}

export interface PolicySettings {
  activeAccount: string;
  accounts: Account[];
  caps: { gemini: Caps; claude: Caps };
  fallback: { enabled: boolean; claudeModel: string; geminiModel: string };
}

export interface AgentConfig {
  provider: string;
  model?: string;
  modeId?: string;
  thinkingOptionId?: string;
  providerOptions?: unknown;
}

export interface PolicyInput {
  config: AgentConfig;
  settings: PolicySettings;
  gemini: Record<string, Usage | undefined>;
  claude: Usage | undefined;
  host: HostEnv;
  now: Date;
}

export type Event =
  | { kind: "fallback"; from: string; to: string; reason: string }
  | { kind: "blocked"; provider: string; reason: string; spareAccount: string | null };

export interface Decision {
  config: AgentConfig;
  /** Env to add for antigravity agents. Empty for every other provider. */
  env: Record<string, string>;
  account: string | null;
  event: Event | null;
}

export const GEMINI = "antigravity";
export const CLAUDE = "claude";

// Mode IDs as reported by `inspect_provider` (Paseo 0.17.5). A fallback never
// raises autonomy: "full-access" and "bypassPermissions" map to a safer mode.
const TO_CLAUDE_MODE: Record<string, string> = {
  default: "default",
  "accept-edits": "acceptEdits",
  auto: "auto",
  plan: "plan",
  "full-access": "acceptEdits",
};
const TO_GEMINI_MODE: Record<string, string> = {
  default: "default",
  acceptEdits: "accept-edits",
  auto: "auto",
  plan: "plan",
  bypassPermissions: "accept-edits",
};

export function accountEnv(account: Account, host: HostEnv): Record<string, string> {
  const env: Record<string, string> = {
    AGY_CLI_FORCE_FILE_TOKEN_STORAGE: "1",
    SSH_CONNECTION: "paseo",
  };
  if (account.home !== host.realHome) {
    env.HOME = account.home;
    env.USERPROFILE = account.home;
    if (host.gitConfig !== null) env.GIT_CONFIG_GLOBAL = host.gitConfig;
    if (!host.windows) env.GH_CONFIG_DIR = `${host.realHome}/.config/gh`;
  }
  return env;
}

export function activeAccount(settings: PolicySettings): Account {
  return settings.accounts.find((account) => account.id === settings.activeAccount) ?? settings.accounts[0];
}

/** Returns why the usage is over its cap, or null. Unknown numbers never count as over. */
export function overCap(usage: Usage | undefined, caps: Caps, now: Date): string | null {
  if (!usage) return null;
  if (usage.limitUntil && Date.parse(usage.limitUntil) > now.getTime()) return "limit message";
  if (usage.fiveHourPct !== null && usage.fiveHourPct >= caps.fiveHourPct)
    return `5h window at ${Math.round(usage.fiveHourPct)}% (cap ${caps.fiveHourPct}%)`;
  if (usage.weeklyPct !== null && usage.weeklyPct >= caps.weeklyPct)
    return `weekly window at ${Math.round(usage.weeklyPct)}% (cap ${caps.weeklyPct}%)`;
  return null;
}

/** First account other than the active one that is under its caps. Only a hint: the switch stays manual. */
export function spareAccount(input: PolicyInput): Account | null {
  const { settings, gemini, now } = input;
  return (
    settings.accounts.find(
      (account) =>
        account.id !== settings.activeAccount &&
        hasUsage(gemini[account.id]) &&
        overCap(gemini[account.id], account.caps ?? settings.caps.gemini, now) === null,
    ) ?? null
  );
}

function hasUsage(usage: Usage | undefined): boolean {
  return Boolean(usage && (usage.fiveHourPct !== null || usage.weeklyPct !== null));
}

function toClaude(config: AgentConfig, settings: PolicySettings): AgentConfig {
  return {
    ...config,
    provider: CLAUDE,
    model: settings.fallback.claudeModel,
    modeId: TO_CLAUDE_MODE[config.modeId ?? "default"] ?? "default",
    thinkingOptionId: undefined,
    providerOptions: undefined,
  };
}

function toGemini(config: AgentConfig, settings: PolicySettings): AgentConfig {
  return {
    ...config,
    provider: GEMINI,
    model: settings.fallback.geminiModel,
    modeId: TO_GEMINI_MODE[config.modeId ?? "default"] ?? "default",
    thinkingOptionId: undefined,
    providerOptions: undefined,
  };
}

export function decide(input: PolicyInput): Decision {
  const { config, settings, gemini, claude, host, now } = input;
  const account = activeAccount(settings);
  const geminiOver = overCap(gemini[account.id], account.caps ?? settings.caps.gemini, now);
  const claudeOver = overCap(claude, settings.caps.claude, now);
  const keepGemini = (event: Event | null): Decision => ({
    config,
    env: accountEnv(account, host),
    account: account.id,
    event,
  });

  if (config.provider === GEMINI) {
    if (!geminiOver) {
      if (account.homeError) {
        return {
          config,
          env: {},
          account: account.id,
          event: { kind: "blocked", provider: GEMINI, reason: `${account.label}: ${account.homeError}`, spareAccount: null },
        };
      }
      return keepGemini(null);
    }
    const reason = `${account.label}: ${geminiOver}`;
    if (settings.fallback.enabled && !claudeOver)
      return {
        config: toClaude(config, settings),
        env: {},
        account: null,
        event: { kind: "fallback", from: GEMINI, to: CLAUDE, reason },
      };
    const blocked = claudeOver ? `${reason}; Claude: ${claudeOver}` : `${reason}; fallback is off`;
    return keepGemini({
      kind: "blocked",
      provider: GEMINI,
      reason: blocked,
      spareAccount: spareAccount(input)?.label ?? null,
    });
  }

  if (config.provider === CLAUDE && claudeOver) {
    const reason = `Claude: ${claudeOver}`;
    if (settings.fallback.enabled && !geminiOver) {
      if (account.homeError) {
        return {
          config,
          env: {},
          account: null,
          event: { kind: "blocked", provider: CLAUDE, reason: `${account.label}: ${account.homeError}`, spareAccount: null },
        };
      }
      return {
        config: toGemini(config, settings),
        env: accountEnv(account, host),
        account: account.id,
        event: { kind: "fallback", from: CLAUDE, to: GEMINI, reason },
      };
    }
    const blocked = geminiOver ? `${reason}; ${account.label}: ${geminiOver}` : `${reason}; fallback is off`;
    return {
      config,
      env: {},
      account: null,
      event: { kind: "blocked", provider: CLAUDE, reason: blocked, spareAccount: spareAccount(input)?.label ?? null },
    };
  }

  return { config, env: {}, account: null, event: null };
}
