import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import { migrateSettings } from "./migrate.ts";

const pct = z.number().int().min(1).max(100);
const caps = z.object({ fiveHourPct: pct, weeklyPct: pct });

const account = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,20}$/, "Use 1-20 lowercase letters, digits or dashes"),
  label: z.string().trim().min(1).max(40),
  /** HOME for agy. "~" = the daemon user's home; other accounts use "~/.agy-homes/<id>". */
  home: z.string().trim().min(1).max(260),
  caps: caps.optional(),
});

// Host scope: every host keeps its own accounts and active account, because
// each host has its own agy sign-ins.
export const guardSettings = defineSettings({
  id: "quota-guard",
  scope: "host",
  version: 2,
  migrate: migrateSettings,
  schema: z
    .object({
      activeAccount: z.string().default("a"),
      accounts: z
        .array(account)
        .min(1)
        .max(5)
        .default([
          { id: "a", label: "Google A", home: "~" },
          { id: "b", label: "Google B", home: "~/.agy-homes/b" },
        ]),
      caps: z
        .object({ gemini: caps, claude: caps })
        .default({ gemini: { fiveHourPct: 90, weeklyPct: 90 }, claude: { fiveHourPct: 85, weeklyPct: 80 } }),
      fallback: z
        .object({
          enabled: z.boolean(),
          claudeModel: z.string().trim().min(1),
          geminiModel: z.string().trim().min(1),
        })
        .default({ enabled: true, claudeModel: "claude-sonnet-5-5", geminiModel: "gemini-4-hydrogen" }),
      ntfy: z
        .object({
          enabled: z.boolean(),
          url: z.url({ protocol: /^https$/ }),
          topic: z.string().regex(/^[A-Za-z0-9_-]{0,64}$/, "Use letters, digits, - or _"),
        })
        .default({ enabled: false, url: "https://ntfy.sh", topic: "" }),
      pollSeconds: z.number().int().min(60).max(3600).default(300),
      /** Case-insensitive substring of the agy usage group name. */
      geminiUsageGroups: z.string().trim().min(1).max(128).default("gemini"),
    })
    .refine((value) => value.accounts.some((entry) => entry.id === value.activeAccount), {
      message: "The active account must be one of the accounts",
      path: ["activeAccount"],
    })
    .refine((value) => new Set(value.accounts.map((entry) => entry.id)).size === value.accounts.length, {
      message: "Account IDs must be unique",
      path: ["accounts"],
    }),
});
