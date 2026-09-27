import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  armImplementSuppress,
  clearImplementSuppress,
  isImplementSuppressed,
} from "./ops.js";

const SUPPRESS_PATH = join(process.cwd(), "runs", "ops", "implement-suppressions.json");

test("implement suppress blocks until cleared or expired", () => {
  if (existsSync(SUPPRESS_PATH)) rmSync(SUPPRESS_PATH);
  assert.equal(isImplementSuppressed("liq-9"), false);
  armImplementSuppress("LIQ-9", "test");
  assert.equal(isImplementSuppressed("LIQ-9"), true);
  clearImplementSuppress("liq-9");
  assert.equal(isImplementSuppressed("LIQ-9"), false);
});
