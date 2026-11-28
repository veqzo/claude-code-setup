import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, overCap, type PolicyInput, type PolicySettings, type Usage } from "./policy.ts";
import { isLimitMessage, markLimited, parseAgyUsage, parseClaudeUsage, withAge } from "./usage.ts";

const now = new Date("2026-11-26T12:00:00Z");
const host = { realHome: "/home/u", windows: false, gitConfig: "/home/u/.gitconfig" };
const settings: PolicySettings = {
  activeAccount: "a",
  accounts: [
    { id: "a", label: "Google A", home: "/home/u" },
    { id: "b", label: "Google B", home: "/home/u/.agy-homes/b" },
  ],
  caps: { gemini: { fiveHourPct: 90, weeklyPct: 90 }, claude: { fiveHourPct: 85, weeklyPct: 80 } },
  fallback: { enabled: true, claudeModel: "claude-sonnet-5-5", geminiModel: "gemini-4-hydrogen" },
};

function usage(fiveHourPct: number | null, weeklyPct: number | null, extra: Partial<Usage> = {}): Usage {
  return { fiveHourPct, weeklyPct, resetsAt: null, fetchedAt: now.toISOString(), estimate: false, limitUntil: null, error: null, ...extra };
}

function input(overrides: Partial<PolicyInput>): PolicyInput {
  return {
    config: { provider: "antigravity", model: "gemini-4-hydrogen", modeId: "auto", thinkingOptionId: "high" },
    settings,
    gemini: { a: usage(10, 20), b: usage(5, 5) },
    claude: usage(10, 10),
    host,
    now,
    ...overrides,
  };
}

test("injects the active account into antigravity agents", () => {
  const accountA = decide(input({}));
  assert.equal(accountA.event, null);
  assert.equal(accountA.account, "a");
  assert.deepEqual(accountA.env, {
    AGY_CLI_FORCE_FILE_TOKEN_STORAGE: "1",
    SSH_CONNECTION: "paseo",
  });

  const accountB = decide(input({ settings: { ...settings, activeAccount: "b" } }));
  assert.equal(accountB.event, null);
  assert.equal(accountB.account, "b");
  assert.deepEqual(accountB.env, {
    AGY_CLI_FORCE_FILE_TOKEN_STORAGE: "1",
    SSH_CONNECTION: "paseo",
    HOME: "/home/u/.agy-homes/b",
    USERPROFILE: "/home/u/.agy-homes/b",
    GIT_CONFIG_GLOBAL: "/home/u/.gitconfig",
    GH_CONFIG_DIR: "/home/u/.config/gh",
  });
  assert.equal(accountB.config.provider, "antigravity");
});

test("adjusts secondary account env for Windows and missing gitconfig", () => {
  const win = decide(input({
    settings: { ...settings, activeAccount: "b" },
    host: { realHome: "C:\\Users\\u", windows: true, gitConfig: "C:\\Users\\u\\.gitconfig" },
  }));
  assert.equal(win.env.HOME, "/home/u/.agy-homes/b");
  assert.equal(win.env.USERPROFILE, "/home/u/.agy-homes/b");
  assert.equal(win.env.GIT_CONFIG_GLOBAL, "C:\\Users\\u\\.gitconfig");
  assert.equal(win.env.GH_CONFIG_DIR, undefined);

  const noGit = decide(input({
    settings: { ...settings, activeAccount: "b" },
    host: { ...host, gitConfig: null },
  }));
  assert.equal(noGit.env.GIT_CONFIG_GLOBAL, undefined);
  assert.equal(noGit.env.GH_CONFIG_DIR, "/home/u/.config/gh");
});

test("falls back to Claude when the active Google account is over its cap", () => {
  const decision = decide(input({ gemini: { a: usage(95, 20) } }));
  assert.deepEqual(decision.config, {
    provider: "claude",
    model: "claude-sonnet-5-5",
    modeId: "auto",
    thinkingOptionId: undefined,
    providerOptions: undefined,
  });
  assert.deepEqual(decision.env, {});
  assert.deepEqual(decision.event, {
    kind: "fallback",
    from: "antigravity",
    to: "claude",
    reason: "Google A: 5h window at 95% (cap 90%)",
  });
});

test("never raises autonomy on a fallback", () => {
  const toClaude = decide(input({ config: { provider: "antigravity", modeId: "full-access" }, gemini: { a: usage(95, 0) } }));
  assert.equal(toClaude.config.modeId, "acceptEdits");
  const toGemini = decide(input({ config: { provider: "claude", modeId: "bypassPermissions" }, claude: usage(90, 0) }));
  assert.equal(toGemini.config.modeId, "accept-edits");
  assert.equal(toGemini.config.provider, "antigravity");
  assert.deepEqual(toGemini.env, {
    AGY_CLI_FORCE_FILE_TOKEN_STORAGE: "1",
    SSH_CONNECTION: "paseo",
  });
});

test("falls back to Gemini when Claude hit a limit message", () => {
  const claude = markLimited(usage(50, 50), now);
  const decision = decide(input({ config: { provider: "claude", modeId: "plan" }, claude }));
  assert.equal(decision.config.provider, "antigravity");
  assert.equal(decision.config.modeId, "plan");
  assert.equal(decision.event?.kind, "fallback");
  assert.match(decision.event?.reason ?? "", /limit message/);
});

test("blocks and names a spare account when both providers are over", () => {
  const decision = decide(input({ gemini: { a: usage(10, 95), b: usage(5, 5) }, claude: usage(90, 10) }));
  assert.equal(decision.config.provider, "antigravity");
  assert.equal(decision.account, "a");
  assert.deepEqual(decision.event, {
    kind: "blocked",
    provider: "antigravity",
    reason: "Google A: weekly window at 95% (cap 90%); Claude: 5h window at 90% (cap 85%)",
    spareAccount: "Google B",
  });
});

test("uses the active account's cap and requires measured usage for a spare", () => {
  const account = { ...settings.accounts[0], caps: { fiveHourPct: 35, weeklyPct: 50 } };
  const decision = decide(input({
    settings: { ...settings, accounts: [account, settings.accounts[1]] },
    gemini: { a: usage(36, null), b: usage(null, null) },
    claude: usage(90, null),
  }));
  assert.equal(decision.event?.kind, "blocked");
  assert.equal(decision.event?.spareAccount, null);
  assert.match(decision.event?.reason ?? "", /cap 35%/);
});

test("respects a disabled fallback and unknown usage", () => {
  const off = { ...settings, fallback: { ...settings.fallback, enabled: false } };
  const decision = decide(input({ settings: off, gemini: { a: usage(99, 99) } }));
  assert.equal(decision.config.provider, "antigravity");
  assert.match(decision.event?.kind === "blocked" ? decision.event.reason : "", /fallback is off/);
  assert.equal(overCap(usage(null, null), settings.caps.gemini, now), null);
  assert.equal(decide(input({ gemini: {} })).event, null);
  assert.deepEqual(decide(input({ config: { provider: "codex" } })).env, {});
  assert.deepEqual(decide(input({ config: { provider: "claude" } })).env, {});
});

test("blocks a Gemini agent and a Claude->Gemini fallback when the account has a homeError", () => {
  const brokenB = { ...settings.accounts[1], homeError: "agy home is missing" };
  const brokenSettings: PolicySettings = {
    ...settings,
    activeAccount: "b",
    accounts: [settings.accounts[0], brokenB],
  };

  const keptGemini = decide(input({ settings: brokenSettings }));
  assert.deepEqual(keptGemini.env, {});
  assert.deepEqual(keptGemini.event, {
    kind: "blocked",
    provider: "antigravity",
    reason: "Google B: agy home is missing",
    spareAccount: null,
  });

  const claudeFallback = decide(input({
    config: { provider: "claude", modeId: "auto" },
    settings: brokenSettings,
    claude: usage(95, 10),
  }));
  assert.deepEqual(claudeFallback.env, {});
  assert.deepEqual(claudeFallback.event, {
    kind: "blocked",
    provider: "claude",
    reason: "Google B: agy home is missing",
    spareAccount: null,
  });
});

test("parses agy usage with the worst bucket per window", () => {
  const stdout = JSON.stringify({
    status: "SUCCESS",
    command: {
      name: "usage",
      data: {
        groups: [
          {
            name: "Gemini models",
            buckets: [
              { id: "g5", name: "5h Remaining", window: "5h", remaining_fraction: 0.4, reset_time: "2026-11-26T14:00:00Z" },
              { id: "gw", name: "Weekly Remaining", window: "weekly", remaining_fraction: 0.75 },
            ],
          },
          {
            name: "Claude models",
            buckets: [
              { id: "c5", name: "5h Remaining", window: "5h", remaining_fraction: 0.1, reset_time: "2026-11-26T13:00:00Z" },
              { id: "off", name: "Weekly Remaining", window: "weekly", remaining_fraction: 0, disabled: true },
            ],
          },
        ],
      },
    },
  });
  const parsed = parseAgyUsage(stdout, now.toISOString());
  assert.equal(parsed.fiveHourPct, 60);
  assert.equal(parsed.weeklyPct, 25);
  assert.equal(parsed.resetsAt, "2026-11-26T14:00:00Z");
  assert.equal(parsed.estimate, false);
  const all = parseAgyUsage(stdout, now.toISOString(), "no such group");
  assert.equal(Math.round(all.fiveHourPct ?? -1), 90);
  assert.equal(all.resetsAt, "2026-11-26T13:00:00Z");
  assert.match(parseAgyUsage("not json", "x").error ?? "", /no JSON/);
  assert.match(parseAgyUsage('{"status":"SUCCESS","response":"/usage"}', "x").error ?? "", /no usage groups/);
  assert.match(parseAgyUsage('{"status":"ERROR","error":"not signed in"}', "x").error ?? "", /not signed in/);
});

test("parses the Claude entry of the Paseo usage list", () => {
  const payload = {
    requestId: "r",
    fetchedAt: now.toISOString(),
    providers: [
      { providerId: "codex", status: "available", windows: [{ id: "x", label: "5h", usedPct: 99 }] },
      {
        providerId: "claude",
        status: "available",
        fetchedAt: "2026-11-26T11:59:00Z",
        windows: [
          { id: "five_hour", label: "Session", usedPct: 42, durationSeconds: 18000, resetsAt: "2026-11-26T15:00:00Z" },
          { id: "seven_day", label: "Weekly", remainingPct: 30, durationSeconds: 604800 },
          { id: "seven_day_opus", label: "Weekly Opus", usedPct: 12 },
        ],
      },
    ],
  };
  const parsed = parseClaudeUsage(payload, now.toISOString());
  assert.equal(parsed.fiveHourPct, 42);
  assert.equal(parsed.weeklyPct, 70);
  assert.equal(parsed.fetchedAt, "2026-11-26T11:59:00Z");
  assert.match(parseClaudeUsage({ providers: [] }, "x").error ?? "", /no Claude usage/);
});

test("detects limit messages and estimates the reset", () => {
  assert.ok(isLimitMessage("claude", "Claude AI usage limit reached|1764165600"));
  assert.ok(isLimitMessage("claude", "You've hit your session limit · resets 3pm"));
  assert.ok(!isLimitMessage("claude", "API Error: 429 rate_limit_error, retrying"));
  assert.ok(isLimitMessage("antigravity", "429 RESOURCE_EXHAUSTED: quota exceeded"));
  assert.ok(!isLimitMessage("codex", "usage limit reached"));

  const guessed = markLimited(undefined, now);
  assert.equal(guessed.limitUntil, "2026-11-26T13:00:00.000Z");
  assert.equal(guessed.estimate, true);
  const reported = markLimited(usage(80, 10, { resetsAt: "2026-11-26T16:00:00Z" }), now);
  assert.equal(reported.limitUntil, "2026-11-26T16:00:00Z");

  const old = usage(1, 1, { fetchedAt: "2026-11-26T11:00:00Z" });
  assert.equal(withAge(old, now, 15 * 60_000).estimate, true);
  assert.equal(withAge(usage(1, 1), now, 15 * 60_000).estimate, false);
});
