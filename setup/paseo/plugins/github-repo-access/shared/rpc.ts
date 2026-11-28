import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const repositoryName = z.string().trim().max(140)
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?\/[a-z0-9_.-]{1,100}$/i)
  .refine((name) => !name.endsWith("/.") && !name.endsWith("/.."));

const visibility = z.enum(["private", "internal", "public"]);
export const repositoryMetadata = z.object({ visibility });

export const accessResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("confirmed"), visibility }),
  z.object({
    status: z.literal("failed"),
    reason: z.enum([
      "missing-token", "unauthorized", "forbidden", "not-found", "rate-limited",
      "conflict", "redirect", "unexpected-response", "unreachable",
    ]),
  }),
]);

export type AccessResult = z.infer<typeof accessResult>;

export const checkAccess = defineRpc({
  name: "github-repo-access.check",
  input: z.object({ repository: repositoryName }),
  output: accessResult,
});
