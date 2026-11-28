import { useState } from "react";
import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsInput, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { checkAccess, repositoryName, type AccessResult } from "../shared/rpc.ts";

const GITHUB_SETTINGS_URL = "https://github.com/settings/personal-access-tokens";

const failureMessage: Record<Extract<AccessResult, { status: "failed" }>["reason"], string> = {
  "missing-token": "GH_TOKEN is missing from the Paseo host environment.",
  unauthorized: "GitHub rejected GH_TOKEN. Check whether it expired or was revoked.",
  forbidden: "GitHub denied the request. Check repository permissions and organization approval.",
  "not-found": "GitHub could not find the repository or its contents. Check the name, repository selection and default branch.",
  "rate-limited": "GitHub limited requests. Try again later.",
  conflict: "GitHub could not read the contents. The repository may be empty.",
  redirect: "GitHub redirected the request. Check the current repository name and owner.",
  "unexpected-response": "GitHub returned an unexpected response.",
  unreachable: "The Paseo host could not complete the GitHub request.",
};

type CheckState =
  | { status: "idle" | "checking" | "disconnected" }
  | AccessResult;

export function RepositoryAccessScreen() {
  const check = useRpc(checkAccess);
  const [input, setInput] = useState("");
  const [state, setState] = useState<CheckState>({ status: "idle" });
  const [linkFailed, setLinkFailed] = useState(false);
  const repository = repositoryName.safeParse(input);
  const checking = state.status === "checking";

  async function openTokenSettings() {
    setLinkFailed(false);
    try {
      await openExternalUrl(GITHUB_SETTINGS_URL);
    } catch {
      setLinkFailed(true);
    }
  }

  async function runCheck() {
    if (!repository.success || checking) return;
    setState({ status: "checking" });
    try {
      setState(await check({ repository: repository.data }));
    } catch {
      setState({ status: "disconnected" });
    }
  }

  return (
    <>
      <SettingsSection title="Manage repository access">
        <SettingsCard>
          <SettingsAction
            label="Fine-grained tokens"
            hint="Select the token used as GH_TOKEN. Add or remove repositories in GitHub."
            error={linkFailed ? "Could not open GitHub settings." : undefined}
            actionLabel="Open GitHub settings"
            onPress={() => void openTokenSettings()}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Check read access">
        <SettingsCard>
          <SettingsInput
            label="Repository (owner/repo)"
            placeholder="owner/repo"
            error={input.trim() && !repository.success ? "Enter a GitHub repository as owner/repo." : undefined}
            disabled={checking}
            onChangeText={(value) => {
              setInput(value);
              setState({ status: "idle" });
            }}
          />
          <SettingsAction
            label="Repository contents"
            hint="Checks read access from this host. Write permissions are outside this check."
            actionLabel={checking ? "Checking…" : "Check"}
            disabled={!repository.success || checking}
            onPress={() => void runCheck()}
          />
          {state.status === "confirmed" && (
            <SettingsRow
              label="Read access confirmed"
              hint={state.visibility === "public"
                ? "This repository is public. Read access alone cannot verify that it is selected for the token."
                : `This host can read the contents of this ${state.visibility} repository with GH_TOKEN.`}
            />
          )}
          {state.status === "failed" && <SettingsRow label="Check failed" error={failureMessage[state.reason]} />}
          {state.status === "disconnected" && <SettingsRow label="Check failed" error="The Paseo host did not return a result." />}
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
