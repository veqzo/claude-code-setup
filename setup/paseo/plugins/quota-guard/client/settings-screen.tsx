import { useCallback, useEffect, useMemo, useState } from "react";
import { Text } from "react-native";
import { useRpc, useSettings, type PluginSurfaceProps, type SettingsState } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { guardSettings } from "../shared/settings.ts";
import { readStatus, refreshStatus, sendTest, type GuardStatus } from "../shared/rpc.ts";

type Ready = Extract<SettingsState<typeof guardSettings.schema>, { status: "ready" }>;
type Values = Ready["values"];
type UsageView = GuardStatus["claude"]["usage"];

function pct(value: number | null): string {
  return value === null ? "?" : `${Math.round(value)}%`;
}

function describe(usage: UsageView, over: string | null): string {
  if (!usage) return "No data yet";
  if (usage.error && usage.fiveHourPct === null && usage.weeklyPct === null) return usage.error;
  const parts = [`5h ${pct(usage.fiveHourPct)}`, `week ${pct(usage.weeklyPct)}`];
  if (usage.resetsAt) parts.push(`resets ${new Date(usage.resetsAt).toLocaleString()}`);
  if (usage.estimate) parts.push("estimate");
  if (over) parts.push(`OVER CAP: ${over}`);
  return parts.join(" · ");
}

function parsePct(text: string): number | null {
  const value = Number(text.trim());
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
}

function useStatus() {
  const read = useRpc(readStatus);
  const refresh = useRpc(refreshStatus);
  const [status, setStatus] = useState<GuardStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (call: typeof read) => {
    setBusy(true);
    try {
      setStatus(await call({}));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Status request failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    read({})
      .then((next) => active && setStatus(next))
      .catch((cause: unknown) => active && setError(cause instanceof Error ? cause.message : "Status request failed"));
    return () => {
      active = false;
    };
  }, [read]);

  return { status, error, busy, refresh: useCallback(() => void run(refresh), [run, refresh]) };
}

function StatusSection({ values, onSwitch, saving }: { values: Values; onSwitch(id: string): void; saving: boolean }) {
  const { status, error, busy, refresh } = useStatus();
  const options = useMemo(
    () => values.accounts.map((account) => ({ label: account.label, value: account.id })),
    [values.accounts],
  );
  return (
    <SettingsSection title="Accounts and usage">
      <SettingsCard>
        <SettingsSelect
          label="Active Google account"
          hint="New Gemini agents use this account. Running agents keep theirs."
          value={values.activeAccount}
          options={options}
          disabled={saving}
          onValueChange={onSwitch}
        />
        {status?.accounts.map((account) => (
          <SettingsRow
            key={account.id}
            label={account.id === status.activeAccount ? `${account.label} (active)` : account.label}
            hint={describe(account.usage, account.over)}
          />
        ))}
        {status ? <SettingsRow label="Claude" hint={describe(status.claude.usage, status.claude.over)} /> : null}
        <SettingsAction
          label="Usage"
          hint="Paseo and agy reports. Old values are marked as estimate."
          actionLabel={busy ? "Refreshing…" : "Refresh"}
          disabled={busy}
          onPress={refresh}
          error={error}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

function CapsSection({ settings, account }: { settings: Ready; account: Values["accounts"][number] }) {
  const caps = settings.values.caps;
  const geminiCaps = account.caps ?? caps.gemini;
  const [draft, setDraft] = useState({
    geminiFive: String(geminiCaps.fiveHourPct),
    geminiWeek: String(geminiCaps.weeklyPct),
    claudeFive: String(caps.claude.fiveHourPct),
    claudeWeek: String(caps.claude.weeklyPct),
  });
  const [error, setError] = useState<string | null>(null);
  const field = (key: keyof typeof draft) => (text: string) => setDraft((current) => ({ ...current, [key]: text }));
  const save = useCallback(async () => {
    const numbers = [draft.geminiFive, draft.geminiWeek, draft.claudeFive, draft.claudeWeek].map(parsePct);
    const [geminiFive, geminiWeek, claudeFive, claudeWeek] = numbers;
    if (geminiFive === null || geminiWeek === null || claudeFive === null || claudeWeek === null) {
      setError("Enter whole numbers from 1 to 100.");
      return;
    }
    setError(null);
    await settings.save(
      {
        ...settings.values,
        accounts: settings.values.accounts.map((entry) =>
          entry.id === account.id ? { ...entry, caps: { fiveHourPct: geminiFive, weeklyPct: geminiWeek } } : entry,
        ),
        caps: { ...settings.values.caps, claude: { fiveHourPct: claudeFive, weeklyPct: claudeWeek } },
      },
      settings.revision,
    );
  }, [account.id, draft, settings]);
  return (
    <SettingsSection title="Caps (percent used)">
      <SettingsCard>
        <SettingsInput label={`${account.label} 5h`} initialValue={draft.geminiFive} onChangeText={field("geminiFive")} />
        <SettingsInput label={`${account.label} weekly`} initialValue={draft.geminiWeek} onChangeText={field("geminiWeek")} />
        <SettingsInput label="Claude 5h" initialValue={draft.claudeFive} onChangeText={field("claudeFive")} />
        <SettingsInput label="Claude weekly" initialValue={draft.claudeWeek} onChangeText={field("claudeWeek")} />
        <SettingsAction
          label="Caps apply to new agents"
          actionLabel="Save caps"
          disabled={settings.saving}
          onPress={() => void save()}
          error={error ?? settings.saveError}
        />
        <SettingsSwitch
          label="Fall back to the other provider"
          hint={`Gemini > ${settings.values.fallback.claudeModel}, Claude > ${settings.values.fallback.geminiModel}`}
          value={settings.values.fallback.enabled}
          disabled={settings.saving}
          onValueChange={(enabled) =>
            void settings.save(
              { ...settings.values, fallback: { ...settings.values.fallback, enabled } },
              settings.revision,
            )
          }
        />
      </SettingsCard>
    </SettingsSection>
  );
}

function AccountsSection({ settings }: { settings: Ready }) {
  const [draft, setDraft] = useState({ id: "", label: "", home: "" });
  const [error, setError] = useState<string | null>(null);
  const { values } = settings;
  const add = useCallback(async () => {
    const account = { id: draft.id.trim(), label: draft.label.trim(), home: draft.home.trim() };
    if (!/^[a-z0-9-]{1,20}$/.test(account.id) || !account.label || !account.home) {
      setError("Enter an ID (a-z, 0-9, -), a label and an app data directory.");
      return;
    }
    if (values.accounts.some((entry) => entry.id === account.id)) {
      setError("This ID exists already.");
      return;
    }
    setError(null);
    await settings.save({ ...values, accounts: [...values.accounts, account] }, settings.revision);
  }, [draft, settings, values]);
  const remove = useCallback(
    (id: string) =>
      void settings.save({ ...values, accounts: values.accounts.filter((entry) => entry.id !== id) }, settings.revision),
    [settings, values],
  );
  return (
    <SettingsSection title="Google accounts">
      <SettingsCard>
        {values.accounts.map((account) => (
          <SettingsAction
            key={account.id}
            label={`${account.label} (${account.id})`}
            hint={account.home}
            actionLabel="Remove"
            disabled={settings.saving || account.id === values.activeAccount}
            onPress={() => remove(account.id)}
          />
        ))}
        <SettingsInput label="New account ID" placeholder="c" onChangeText={(id) => setDraft((d) => ({ ...d, id }))} />
        <SettingsInput label="Label" placeholder="Google C" onChangeText={(label) => setDraft((d) => ({ ...d, label }))} />
        <SettingsInput
          label="agy HOME (~ or ~/.agy-homes/<id>)"
          placeholder="~/.agy-homes/c"
          onChangeText={(home) => setDraft((d) => ({ ...d, home }))}
        />
        <SettingsAction
          label="Sign in once in a terminal first (see the setup guide)"
          actionLabel="Add account"
          disabled={settings.saving}
          onPress={() => void add()}
          error={error}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

function NotifySection({ settings }: { settings: Ready }) {
  const test = useRpc(sendTest);
  const [draft, setDraft] = useState({ url: settings.values.ntfy.url, topic: settings.values.ntfy.topic });
  const [result, setResult] = useState<string | null>(null);
  const save = (enabled: boolean) =>
    void settings.save({ ...settings.values, ntfy: { enabled, url: draft.url.trim(), topic: draft.topic.trim() } }, settings.revision);
  const runTest = useCallback(async () => {
    try {
      const delivery = await test({});
      setResult(`Push: ${delivery.push}. ntfy: ${delivery.ntfy}.`);
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Test failed");
    }
  }, [test]);
  return (
    <SettingsSection title="Notifications">
      <SettingsCard>
        <SettingsSwitch
          label="Send to ntfy"
          hint="The token comes from NTFY_TOKEN and goes only to NTFY_URL (daemon environment)."
          value={settings.values.ntfy.enabled}
          disabled={settings.saving}
          onValueChange={save}
        />
        <SettingsInput label="ntfy server" initialValue={draft.url} onChangeText={(url) => setDraft((d) => ({ ...d, url }))} />
        <SettingsInput
          label="ntfy topic"
          initialValue={draft.topic}
          onChangeText={(topic) => setDraft((d) => ({ ...d, topic }))}
        />
        <SettingsAction
          label="ntfy server and topic"
          actionLabel="Save"
          disabled={settings.saving}
          onPress={() => save(settings.values.ntfy.enabled)}
          error={settings.saveError}
        />
        <SettingsAction label="Send a test message" hint={result ?? undefined} actionLabel="Test" onPress={() => void runTest()} />
      </SettingsCard>
    </SettingsSection>
  );
}

export function GuardSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(guardSettings);
  const style = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  if (settings.status === "loading") return <Text style={style}>Loading settings…</Text>;
  if (settings.status !== "ready")
    return (
      <SettingsSection title="Quota guard">
        <Text style={style}>{settings.error}</Text>
        <SettingsAction label="Try again" actionLabel="Reload" onPress={settings.reload} />
        {settings.status === "invalid" ? (
          <SettingsAction label="Restore default settings" actionLabel="Reset" onPress={settings.reset} />
        ) : null}
      </SettingsSection>
    );
  const switchAccount = (activeAccount: string) =>
    void settings.save({ ...settings.values, activeAccount }, settings.revision);
  return (
    <>
      <StatusSection values={settings.values} onSwitch={switchAccount} saving={settings.saving} />
      <CapsSection
        key={settings.values.activeAccount}
        settings={settings}
        account={settings.values.accounts.find((account) => account.id === settings.values.activeAccount) ?? settings.values.accounts[0]}
      />
      <AccountsSection settings={settings} />
      <NotifySection settings={settings} />
    </>
  );
}
