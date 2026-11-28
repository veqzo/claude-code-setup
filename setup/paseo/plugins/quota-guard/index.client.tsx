import type { PluginClientContext } from "@getpaseo/plugin/client";
import { GuardSettingsScreen } from "./client/settings-screen.tsx";

export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({
    id: "quota-guard",
    title: "Quota guard",
    icon: "Gauge",
    Component: GuardSettingsScreen,
  });
  // The manual account switch: one entry in the command center opens the screen.
  client.addCommandCenterItem({
    id: "switch-account",
    title: "Switch Gemini account",
    icon: "ArrowLeftRight",
    context: "global",
    onSelect({ openSettings }) {
      openSettings("quota-guard");
    },
  });
  return () => {};
}
