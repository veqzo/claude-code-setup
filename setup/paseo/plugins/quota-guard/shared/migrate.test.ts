import assert from "node:assert/strict";
import { test } from "node:test";
import { migrateSettings } from "./migrate.ts";

test("migrates v1 account homes to agy HOME paths without mutating input", () => {
  const input = {
    activeAccount: "a",
    accounts: [
      { id: "a", label: "Google A", home: "~/.gemini/antigravity-cli" },
      { id: "b", label: "Google B", home: "~/.gemini/antigravity-cli-b" },
      { id: "c", label: "Google C", home: "~\\.gemini\\antigravity-cli-c\\" },
      { id: "d", label: "Google D", home: "~/.gemini/antigravity-cli/" },
      { id: "custom", label: "Custom", home: "/srv/custom-home" },
    ],
    pollSeconds: 300,
  };
  const snapshot = structuredClone(input);

  const migrated = migrateSettings(input, 1) as typeof input;

  assert.deepEqual(input, snapshot);
  assert.notEqual(migrated, input);
  assert.deepEqual(migrated.accounts, [
    { id: "a", label: "Google A", home: "~" },
    { id: "b", label: "Google B", home: "~/.agy-homes/b" },
    { id: "c", label: "Google C", home: "~/.agy-homes/c" },
    { id: "d", label: "Google D", home: "~" },
    { id: "custom", label: "Custom", home: "/srv/custom-home" },
  ]);
  assert.equal(migrated.pollSeconds, 300);
});

test("handles windows backslashes on account A home", () => {
  const migrated = migrateSettings(
    { accounts: [{ id: "a", label: "A", home: "~\\.gemini\\antigravity-cli" }] },
    0,
  ) as { accounts: Array<{ home: string }> };
  assert.equal(migrated.accounts[0].home, "~");
});

test("leaves v2+, non-objects, and objects without accounts unchanged", () => {
  const v2 = { accounts: [{ id: "a", label: "A", home: "~/.gemini/antigravity-cli" }] };
  assert.equal(migrateSettings(v2, 2), v2);
  assert.equal(migrateSettings(null, 1), null);
  assert.equal(migrateSettings("bad", 1), "bad");
  assert.deepEqual(migrateSettings([1, 2], 1), [1, 2]);
  const noAccounts = { activeAccount: "a" };
  assert.equal(migrateSettings(noAccounts, 1), noAccounts);
});
