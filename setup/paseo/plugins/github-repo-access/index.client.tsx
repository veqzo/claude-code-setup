import type { PluginClientContext } from "@getpaseo/plugin/client";
import { RepositoryAccessScreen } from "./client/settings-screen.tsx";

export default function contribute(client: PluginClientContext) {
  return client.addSettingsScreen({
    id: "github-repo-access",
    title: "GitHub repository access",
    icon: "KeyRound",
    Component: RepositoryAccessScreen,
  });
}
