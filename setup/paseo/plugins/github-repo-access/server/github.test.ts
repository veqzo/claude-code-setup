import assert from "node:assert/strict";
import { test } from "node:test";
import { accessResult, checkAccess } from "../shared/rpc.ts";
import { checkRepository } from "./github.ts";

const fakeCredential = "simulated-credential";
const endpoint = "https://api.github.com/repos/example/project";

test("validates the RPC input as a single owner/repo", () => {
  assert.deepEqual(checkAccess.input.parse({ repository: " Example/project.test " }), {
    repository: "Example/project.test",
  });
  for (const repository of ["https://github.com/example/project", "example/a/b", "example/..",
    "example/.", "example/repo?ref=branch", "example/%2f", "example\\repo", "example/"]) {
    assert.equal(checkAccess.input.safeParse({ repository }).success, false, repository);
  }
});

for (const visibility of ["private", "internal", "public"]) {
  test(`confirms readability with ${visibility} visibility and returns no GitHub data`, async () => {
    const urls: string[] = [];
    const contents = Response.json([{ name: "private-file.txt" }]);
    const result = await checkRepository("example/project", fakeCredential, async (url, options) => {
      urls.push(String(url));
      assert.equal(options?.method, "GET");
      assert.equal(options.redirect, "manual");
      assert.ok(options.signal);
      assert.ok(new Headers(options.headers).get("authorization") === `Bearer ${fakeCredential}`);
      return urls.length === 1 ? Response.json({ visibility, permissions: { push: true } }) : contents;
    });
    assert.deepEqual(urls, [endpoint, `${endpoint}/contents`]);
    assert.ok(contents.bodyUsed);
    assert.deepEqual(accessResult.parse(result), { status: "confirmed", visibility });
    assert.deepEqual(result, { status: "confirmed", visibility });
  });
}

test("requires GH_TOKEN and makes no request without it", async () => {
  const request = async () => assert.fail("Unexpected GitHub request");
  assert.deepEqual(await checkRepository("example/project", undefined, request), {
    status: "failed", reason: "missing-token",
  });
});

test("returns a failure when metadata is readable but contents are inaccessible", async () => {
  const result = await checkRepository("example/project", fakeCredential, async (url) =>
    url === endpoint ? Response.json({ visibility: "private" }) : new Response(null, { status: 404 })
  );
  assert.deepEqual(result, { status: "failed", reason: "not-found" });
});

test("rejects redirects, API failures and response bodies with an unknown visibility", async () => {
  for (const [response, reason] of [
    [new Response(fakeCredential, { status: 401 }), "unauthorized"],
    [new Response(fakeCredential, { status: 403 }), "forbidden"],
    [new Response(null, { status: 403, headers: { "retry-after": "5" } }), "rate-limited"],
    [new Response(null, { status: 429 }), "rate-limited"],
    [new Response(null, { status: 409 }), "conflict"],
    [Response.redirect("https://other.example"), "redirect"],
    [Response.json({ visibility: fakeCredential }), "unexpected-response"],
  ] as const) {
    const urls: string[] = [];
    const result = await checkRepository("example/project", fakeCredential, async (url) => {
      urls.push(String(url));
      return response;
    });
    assert.deepEqual(urls, [endpoint]);
    assert.deepEqual(result, { status: "failed", reason });
  }
});

test("does not return network error details", async () => {
  const result = await checkRepository("example/project", fakeCredential, async () => {
    throw new Error(fakeCredential);
  });
  assert.deepEqual(result, { status: "failed", reason: "unreachable" });
});
