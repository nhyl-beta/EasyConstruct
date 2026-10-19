import { test } from "node:test";
import assert from "node:assert/strict";
import { planBackfill } from "./backfill.js";

test("spellings of one company become one entry under the most used spelling", () => {
  const plan = planBackfill(
    ["GreenPower Inc.", "GreenPower Inc.", "greenpower", "GreenPower Incorporated", "City of Riverside"],
    new Set(),
  );
  assert.deepEqual(plan.toCreate.map((e) => e.name), ["City of Riverside", "GreenPower Inc."]);
  const green = plan.toCreate.find((e) => e.name === "GreenPower Inc.")!;
  assert.equal(green.occurrences, 4);
  assert.deepEqual(green.variants.sort(), ["GreenPower Incorporated", "greenpower"]);
});

test("keys that already exist are left alone", () => {
  const plan = planBackfill(["GreenPower Inc.", "Harbor Freight Corp"], new Set(["greenpower"]));
  assert.deepEqual(plan.toCreate.map((e) => e.name), ["Harbor Freight Corp"]);
  assert.equal(plan.alreadyPresent, 1);
});

test("blank and missing values are skipped and counted", () => {
  const plan = planBackfill(["", "  ", null, undefined, "Acme Builders"], new Set());
  assert.equal(plan.toCreate.length, 1);
  assert.equal(plan.skippedBlank, 4);
});

test("running the plan again after it was applied plans nothing (idempotent)", () => {
  const values = ["Acme Builders", "ACME builders", "Westgate Health Group"];
  const first = planBackfill(values, new Set());
  const second = planBackfill(values, new Set(first.toCreate.map((e) => e.nameKey)));
  assert.equal(second.toCreate.length, 0);
  assert.equal(second.alreadyPresent, first.toCreate.length);
});

test("a tie between spellings is broken alphabetically, so the plan is stable", () => {
  const a = planBackfill(["Zeta Corp", "zeta corp"], new Set());
  const b = planBackfill(["zeta corp", "Zeta Corp"], new Set());
  assert.equal(a.toCreate[0]!.name, b.toCreate[0]!.name);
});
