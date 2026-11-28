import assert from "node:assert/strict";
import { test } from "node:test";
import { ntfyAllowed, tokenFor } from "./notify.ts";

test("allows only the public ntfy server and the daemon's HTTPS origin", () => {
  assert.ok(ntfyAllowed("https://ntfy.sh", ""));
  assert.ok(ntfyAllowed("https://ntfy.example.com/subpath", "https://ntfy.example.com"));
  assert.equal(ntfyAllowed("https://unapproved.example.com", ""), false);
  assert.equal(ntfyAllowed("http://ntfy.example.com", "http://ntfy.example.com"), false);
  assert.equal(ntfyAllowed("https://user@ntfy.sh", ""), false);
});

test("sends the ntfy token only to the origin in NTFY_URL", () => {
  const env = { NTFY_TOKEN: "tk_test", NTFY_URL: "https://ntfy.example.com" };
  assert.equal(tokenFor("https://ntfy.example.com/", env), "tk_test");
  assert.equal(tokenFor("https://ntfy.example.com:443", env), "tk_test");
  assert.equal(tokenFor("https://evil.example.net", env), null);
  assert.equal(tokenFor("http://ntfy.example.com", env), null);
  assert.equal(tokenFor("https://ntfy.example.com", { NTFY_TOKEN: "tk_test" }), null);
  assert.equal(tokenFor("not a url", env), null);
});
