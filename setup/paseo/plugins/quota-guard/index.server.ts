import type { PluginServerContext } from "@getpaseo/plugin/server";
import { guardSettings } from "./shared/settings.ts";
import { readStatus, refreshStatus, sendTest } from "./shared/rpc.ts";
import { Guard, hostEnv, policySettings, type Settings } from "./server/guard.ts";
import { createNotifier, type Alert } from "./server/notify.ts";
import { CLAUDE, GEMINI, activeAccount, decide, overCap } from "./server/policy.ts";
import { isLimitMessage, markLimited } from "./server/usage.ts";

const COOLDOWN_MS = 30 * 60_000;
const META = {
  account: "quota-guard.account",
  fallbackFrom: "quota-guard.fallbackFrom",
  reason: "quota-guard.reason",
} as const;
const NAMES: Record<string, string> = { [GEMINI]: "Gemini", [CLAUDE]: "Claude" };

/** Limit messages are the whole reply. Long text only quotes one, e.g. while editing this plugin. */
const MAX_LIMIT_TEXT = 400;

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(guardSettings);
  const guard = new Guard();
  const send = createNotifier(server);
  let current: Settings | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const notify = (alert: Alert) => {
    if (!current) return;
    void send(alert, current.ntfy);
  };

  /** Sends one "cap reached" alert per account and provider inside the cooldown. */
  const announceCaps = (values: Settings) => {
    const now = new Date();
    const policy = policySettings(values);
    const { gemini, claude } = guard.snapshot(values, now);
    for (const account of policy.accounts) {
      const over = overCap(gemini[account.id], account.caps ?? policy.caps.gemini, now);
      if (!over) continue;
      const active = account.id === policy.activeAccount;
      notify({
        title: `${account.label} is over its cap`,
        body: active
          ? `${over}. New Gemini agents fall back to Claude. Switch the account in Settings > Quota guard.`
          : `${over}. This account is not active.`,
        key: `cap:gemini:${account.id}`,
        cooldownMs: COOLDOWN_MS,
        priority: active ? 4 : 3,
        tags: ["warning"],
      });
    }
    const over = overCap(claude, policy.caps.claude, now);
    if (over)
      notify({
        title: "Claude is over its cap",
        body: `${over}. New Claude agents fall back to Gemini.`,
        key: "cap:claude",
        cooldownMs: COOLDOWN_MS,
        priority: 4,
        tags: ["warning"],
      });
  };

  const pollGemini = async (values: Settings) => {
    await guard.pollGemini(values);
    announceCaps(values);
  };

  const apply = (values: Settings) => {
    const previous = current;
    current = values;
    if (!previous || previous.pollSeconds !== values.pollSeconds) {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (current) void pollGemini(current);
      }, values.pollSeconds * 1000);
      timer.unref?.();
    }
    if (previous && previous.activeAccount !== values.activeAccount) {
      const account = activeAccount(policySettings(values));
      notify({
        title: `Gemini account: ${account.label}`,
        body: "New Gemini agents use this account. Running agents keep their account.",
        key: `switch:${account.id}`,
        cooldownMs: 0,
        priority: 3,
        tags: ["arrows_counterclockwise"],
      });
    }
    const sameAccounts =
      previous &&
      previous.accounts.length === values.accounts.length &&
      values.accounts.every((account, index) =>
        account.id === previous.accounts[index].id && account.home === previous.accounts[index].home) &&
      previous.geminiUsageGroups === values.geminiUsageGroups;
    if (!sameAccounts) void pollGemini(values);
  };

  const unsubscribe = settings.subscribe((state) => {
    if (state.status === "ready") apply(state.values);
    else console.warn("[quota-guard] settings are invalid; the guard keeps its last valid settings");
  });
  void settings.read().then((state) => {
    if (state.status === "ready" && !current) apply(state.values);
  });

  const values = async (): Promise<Settings> => {
    if (current) return current;
    const state = await settings.read();
    if (state.status !== "ready") throw new Error("Quota guard settings are invalid. Fix them in Settings.");
    apply(state.values);
    return state.values;
  };

  server.addHook("agent.create.before", async ({ request }, { paseo }) => {
    // Internal helpers (commit messages, titles) stay as configured.
    if (request.config.internal) return request;
    const provider = request.config.provider;
    if (provider !== GEMINI && provider !== CLAUDE) return request;
    const settingsNow = await values();
    const checkedAt = new Date();
    await Promise.all([
      guard.claudeStale(settingsNow, checkedAt) ? guard.pollClaude(paseo) : undefined,
      guard.gemini[settingsNow.activeAccount] ? undefined : guard.pollGemini(settingsNow),
    ]);
    const now = new Date();
    const decision = decide({
      config: request.config,
      settings: policySettings(settingsNow),
      ...guard.snapshot(settingsNow, now),
      host: hostEnv(),
      now,
    });
    const metadata = { ...request.metadata };
    if (decision.account) metadata[META.account] = decision.account;
    const event = decision.event;
    if (event?.kind === "fallback") {
      metadata[META.fallbackFrom] = event.from;
      metadata[META.reason] = event.reason;
    }
    if (event?.kind === "blocked") {
      const hint = event.spareAccount
        ? ` ${event.spareAccount} is under its cap: switch to it in Settings > Quota guard.`
        : "";
      notify({
        title: `${NAMES[event.provider]} agent reached its cap`,
        body: `${event.reason}.${hint}`,
        key: `blocked:${event.provider}`,
        cooldownMs: COOLDOWN_MS,
        priority: 4,
        tags: ["no_entry"],
      });
      throw new Error(`${event.reason}.${hint}`);
    }
    const switched = decision.config.provider !== provider;
    return {
      ...request,
      config: switched
        ? {
            ...request.config,
            provider: decision.config.provider,
            model: decision.config.model,
            modeId: decision.config.modeId,
            thinkingOptionId: undefined,
            providerOptions: undefined,
          }
        : request.config,
      env: { ...request.env, ...decision.env },
      metadata,
    };
  });

  // The agent ID exists only after creation, so the fallback alert opens the agent from here.
  server.addHook("agent.create.after", async ({ agent }) => {
    const from = agent.metadata[META.fallbackFrom];
    if (typeof from !== "string") return;
    const reason = agent.metadata[META.reason];
    notify({
      title: `Fallback: ${NAMES[from] ?? from} > ${NAMES[agent.provider] ?? agent.provider}`,
      body: `${agent.title ?? "New agent"} runs on ${NAMES[agent.provider] ?? agent.provider}. ${typeof reason === "string" ? reason : ""}`.trim(),
      key: `fallback:${agent.id}`,
      cooldownMs: 0,
      priority: 3,
      tags: ["twisted_rightwards_arrows"],
      agentId: agent.id,
    });
  });

  server.addHook("agent.turn.after", async ({ agent, turnId, outcome }, { paseo }) => {
    if (outcome.kind === "canceled" || !current) return;
    const provider = agent.provider;
    if (provider !== GEMINI && provider !== CLAUDE) return;
    if (provider === CLAUDE && guard.claudeStale(current, new Date())) {
      await guard.pollClaude(paseo);
      announceCaps(current);
    }

    let text = outcome.kind === "failed" ? outcome.error.message : "";
    if (!isLimitMessage(provider, text) && turnId) {
      const page = await paseo.agents
        .ref(agent.id)
        .timeline.refetch({ direction: "tail", limit: 1, wholeTurns: true })
        .catch(() => null);
      const last = page?.entries.filter((entry) => entry.turnId === turnId).at(-1)?.item;
      text = last && "text" in last && typeof last.text === "string" ? last.text : "";
    }
    if (text.length > MAX_LIMIT_TEXT || !isLimitMessage(provider, text)) return;

    const now = new Date();
    if (provider === CLAUDE) {
      guard.claude = markLimited(guard.claude, now);
      notify({
        title: "Claude usage limit reached",
        body: `Claude is capped until about ${guard.claude.limitUntil}. New Claude agents fall back to Gemini.`,
        key: "limit:claude",
        cooldownMs: COOLDOWN_MS,
        priority: 4,
        tags: ["rotating_light"],
        agentId: agent.id,
      });
      return;
    }
    const policy = policySettings(current);
    const stored = agent.metadata[META.account];
    const account = policy.accounts.find((entry) => entry.id === stored) ?? activeAccount(policy);
    guard.gemini = { ...guard.gemini, [account.id]: markLimited(guard.gemini[account.id], now) };
    notify({
      title: `${account.label}: Gemini quota exhausted`,
      body: `Capped until about ${guard.gemini[account.id].limitUntil}. Switch the account in Settings > Quota guard.`,
      key: `limit:gemini:${account.id}`,
      cooldownMs: COOLDOWN_MS,
      priority: 4,
      tags: ["rotating_light"],
      agentId: agent.id,
    });
  });

  server.handle(readStatus, async () => guard.status(await values()));

  server.handle(refreshStatus, async (_input, { paseo }) => {
    const settingsNow = await values();
    await Promise.all([pollGemini(settingsNow), guard.pollClaude(paseo)]);
    return guard.status(settingsNow);
  });

  server.handle(sendTest, async () => {
    const settingsNow = await values();
    return send(
      {
        title: "Quota guard test",
        body: "Notifications from the quota guard reach this device.",
        key: `test:${Date.now()}`,
        cooldownMs: 0,
        priority: 3,
        tags: ["white_check_mark"],
      },
      settingsNow.ntfy,
    );
  });

  return () => {
    unsubscribe();
    if (timer) clearInterval(timer);
  };
}
