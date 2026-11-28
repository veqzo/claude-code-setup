import type { PluginServerContext } from "@getpaseo/plugin/server";
import { checkRepository } from "./server/github.ts";
import { checkAccess } from "./shared/rpc.ts";

export default function contribute(server: PluginServerContext) {
  server.handle(checkAccess, ({ repository }) => checkRepository(repository, process.env.GH_TOKEN));
  return () => {};
}
