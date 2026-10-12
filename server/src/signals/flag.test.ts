// The decision-support flag is read when config/features.ts first loads, so this
// lives in its own file (each test file runs in its own process) and sets the
// flag before importing the module under test.
import { test } from "node:test";
import assert from "node:assert/strict";

test("evaluateSignals returns [] when FEATURE_AI=false", async () => {
  process.env.FEATURE_AI = "false";
  const { evaluateSignals } = await import("./index.js");
  const snapshot = {
    project: { code: "T-1", status: "Construction", contractValue: "4500000" },
    budgets: [{ planned: "5320000", actual: "0" }],
    tasks: [],
    milestones: [],
  } as never;
  assert.deepEqual(evaluateSignals(snapshot, new Date()), []);
});
