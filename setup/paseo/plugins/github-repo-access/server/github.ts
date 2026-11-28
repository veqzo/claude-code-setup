import { repositoryMetadata, type AccessResult } from "../shared/rpc.ts";

const GITHUB_API = "https://api.github.com";
const CHECK_TIMEOUT_MS = 10_000;

function httpFailure(response: Response): AccessResult {
  const { status } = response;
  if (status === 429 || (status === 403 && (
    response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")
  ))) {
    return { status: "failed", reason: "rate-limited" };
  }
  if (status >= 300 && status < 400) return { status: "failed", reason: "redirect" };
  if (status === 401) return { status: "failed", reason: "unauthorized" };
  if (status === 403) return { status: "failed", reason: "forbidden" };
  if (status === 404) return { status: "failed", reason: "not-found" };
  if (status === 409) return { status: "failed", reason: "conflict" };
  return { status: "failed", reason: "unexpected-response" };
}

export async function checkRepository(
  repository: string,
  token: string | undefined,
  request: typeof fetch = fetch,
): Promise<AccessResult> {
  if (!token?.trim()) return { status: "failed", reason: "missing-token" };

  const path = repository.split("/").map(encodeURIComponent).join("/");
  const url = `${GITHUB_API}/repos/${path}`;
  const options: RequestInit = {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  };

  try {
    const metadata = await request(url, options);
    if (metadata.status !== 200) {
      await metadata.body?.cancel();
      return httpFailure(metadata);
    }
    const parsed = repositoryMetadata.safeParse(await metadata.json().catch(() => null));
    if (!parsed.success) return { status: "failed", reason: "unexpected-response" };

    // GitHub's root contents endpoint tests Contents permission. Discard the listing.
    const contents = await request(`${url}/contents`, options);
    await contents.body?.cancel();
    if (contents.status !== 200) return httpFailure(contents);
    return { status: "confirmed", visibility: parsed.data.visibility };
  } catch {
    // Fetch errors can contain request or response details. Return a fixed code.
    return { status: "failed", reason: "unreachable" };
  }
}
