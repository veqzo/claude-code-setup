function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrateHome(home: string): string {
  const normalized = home.replaceAll("\\", "/").replace(/\/+$/, "");
  if (normalized === "~/.gemini/antigravity-cli") return "~";
  const prefix = "~/.gemini/antigravity-cli-";
  if (normalized.startsWith(prefix)) {
    const suffix = normalized.slice(prefix.length);
    if (suffix && !suffix.includes("/")) return `~/.agy-homes/${suffix}`;
  }
  return home;
}

/** Migrates stored quota-guard settings from earlier schema versions. */
export function migrateSettings(values: unknown, fromVersion: number): unknown {
  if (fromVersion >= 2 || !isRecord(values) || !Array.isArray(values.accounts)) {
    return values;
  }
  return {
    ...values,
    accounts: values.accounts.map((entry) => {
      if (!isRecord(entry)) return entry;
      if (typeof entry.home !== "string") return { ...entry };
      return { ...entry, home: migrateHome(entry.home) };
    }),
  };
}
