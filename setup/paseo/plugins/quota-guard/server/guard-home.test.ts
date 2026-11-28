import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { homeError } from "./guard.ts";

test("homeError accepts realHome and existing directories inside ~/.agy-homes", (t) => {
  const realHome = fs.mkdtempSync(path.join(os.tmpdir(), "guard-home-"));
  t.after(() => fs.rmSync(realHome, { recursive: true, force: true }));

  assert.equal(homeError(realHome, realHome), null);

  const agyHomes = path.join(realHome, ".agy-homes");
  const accountB = path.join(agyHomes, "b");
  const filePath = path.join(agyHomes, "not-a-dir");
  fs.mkdirSync(accountB, { recursive: true });
  fs.writeFileSync(filePath, "x");

  assert.equal(homeError(accountB, realHome), null);

  const missing = path.join(agyHomes, "c");
  const missingMsg = homeError(missing, realHome);
  assert.ok(missingMsg);
  assert.ok(!missingMsg.includes(realHome));

  const fileMsg = homeError(filePath, realHome);
  assert.ok(fileMsg);
  assert.ok(!fileMsg.includes(realHome));

  const rootMsg = homeError(agyHomes, realHome);
  assert.ok(rootMsg);
  assert.ok(!rootMsg.includes(realHome));

  const outsideMsg = homeError(path.join(realHome, "other"), realHome);
  assert.ok(outsideMsg);
  assert.ok(!outsideMsg.includes(realHome));

  const parentMsg = homeError(path.dirname(realHome), realHome);
  assert.ok(parentMsg);
  assert.ok(!parentMsg.includes(realHome));
});
