import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

const usage = z.object({
  fiveHourPct: z.number().nullable(),
  weeklyPct: z.number().nullable(),
  resetsAt: z.string().nullable(),
  fetchedAt: z.string().nullable(),
  estimate: z.boolean(),
  limitUntil: z.string().nullable(),
  error: z.string().nullable(),
});

const status = z.object({
  activeAccount: z.string(),
  accounts: z.array(
    z.object({ id: z.string(), label: z.string(), over: z.string().nullable(), usage: usage.nullable() }),
  ),
  claude: z.object({ over: z.string().nullable(), usage: usage.nullable() }),
});

export type GuardStatus = z.infer<typeof status>;

/** Current usage per Google account and for Claude, from the cache. */
export const readStatus = defineRpc({ name: "quota-guard.status", input: z.object({}), output: status });

/** Polls agy and Paseo now, then returns the fresh status. */
export const refreshStatus = defineRpc({ name: "quota-guard.refresh", input: z.object({}), output: status });

/** Sends a test message to every configured channel. */
export const sendTest = defineRpc({
  name: "quota-guard.test",
  input: z.object({}),
  output: z.object({ push: z.string(), ntfy: z.string() }),
});
