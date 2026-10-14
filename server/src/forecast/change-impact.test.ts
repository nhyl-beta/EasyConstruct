import { test } from "node:test";
import assert from "node:assert/strict";
import { forecastChangeImpact, mapRequestImpact, parseAmount, type ImpactInput } from "./change-impact.js";

const base: ImpactInput = {
  contractValue: 1_000_000,
  budgets: [
    { planned: 600_000, actual: 300_000 },
    { planned: 400_000, actual: 100_000 },
  ],
  tasks: [{ status: "Completed" }, { status: "Completed" }, { status: "Pending" }, { status: "In Progress" }],
  requestedAmount: 100_000,
  timeImpactDays: 10,
  milestones: [
    { id: 1, title: "Shell", status: "active", estimatedCompletionDate: "2026-12-01" },
    { id: 2, title: "Done", status: "completed", estimatedCompletionDate: "2026-10-01" },
    { id: 3, title: "No date", status: "draft", estimatedCompletionDate: null },
  ],
};

test("new total, percent over contract and estimate at completion", () => {
  const f = forecastChangeImpact(base);
  assert.equal(f.newTotal, 1_100_000);
  assert.equal(f.percentOverContract, 10);
  assert.equal(f.completionPct, 50);
  assert.equal(f.estimateAtCompletion, 800_000); // 400k actual / 0.5
  assert.equal(f.estimateAtCompletionIfApproved, 900_000);
  assert.equal(f.projectedOverrun, -100_000); // 900k vs a 1M contract: no overrun
});

test("schedule slip moves only open milestones that have a date", () => {
  const f = forecastChangeImpact(base);
  assert.equal(f.scheduleSlipDays, 10);
  assert.deepEqual(f.movedMilestones, [{ id: 1, title: "Shell", from: "2026-12-01", to: "2026-12-11" }]);
});

test("severity follows the thresholds", () => {
  assert.equal(forecastChangeImpact({ ...base, requestedAmount: 0, timeImpactDays: 0 }).severity, "info");
  assert.equal(forecastChangeImpact({ ...base, requestedAmount: 100_000, timeImpactDays: 0 }).severity, "warn"); // +10%
  assert.equal(forecastChangeImpact({ ...base, requestedAmount: 250_000, timeImpactDays: 0 }).severity, "critical"); // +25%
  assert.equal(forecastChangeImpact({ ...base, requestedAmount: 0, timeImpactDays: 25 }).severity, "critical"); // 25 days
});

test("zero progress gives no estimate at completion instead of dividing by zero", () => {
  const f = forecastChangeImpact({ ...base, tasks: [{ status: "Pending" }] });
  assert.equal(f.estimateAtCompletion, null);
  assert.equal(f.projectedOverrun, null);
  assert.match(f.sentence, /not available yet/);
});

test("no tasks at all", () => {
  const f = forecastChangeImpact({ ...base, tasks: [] });
  assert.equal(f.completionPct, null);
  assert.equal(f.estimateAtCompletion, null);
});

test("zero or missing contract value skips the contract comparison", () => {
  for (const contractValue of [null, 0]) {
    const f = forecastChangeImpact({ ...base, contractValue });
    assert.equal(f.percentOverContract, null);
    assert.equal(f.contractValue, null);
    assert.match(f.sentence, /no contract value/);
  }
});

test("the sentence reads plainly", () => {
  const f = forecastChangeImpact(base);
  assert.equal(
    f.sentence,
    "If approved: +10% against contract, estimate at completion PHP 900,000, finish moves 10 days.",
  );
});

test("a saving shows a negative amount and no slip", () => {
  const f = forecastChangeImpact({ ...base, requestedAmount: -50_000, timeImpactDays: 0 });
  assert.equal(f.percentOverContract, -5);
  assert.match(f.sentence, /-5% against contract/);
  assert.match(f.sentence, /finish does not move/);
});

test("RFI/RFA impact mapping", () => {
  assert.deepEqual(mapRequestImpact({ costImpact: "none", timeImpact: "none" }), {
    requestedAmount: 0,
    timeImpactDays: 0,
    notes: [],
  });
  const inc = mapRequestImpact({
    costImpact: "increase",
    costNote: "Subject for variation about PHP 38,000",
    timeImpact: "increase",
    timeDays: 2,
  });
  assert.equal(inc.requestedAmount, 38_000);
  assert.equal(inc.timeImpactDays, 2);
  const dec = mapRequestImpact({ costImpact: "decrease", costNote: "saves ₱5,000", timeImpact: "decrease", timeDays: 3 });
  assert.equal(dec.requestedAmount, -5_000);
  assert.equal(dec.timeImpactDays, -3);
  const unstated = mapRequestImpact({ costImpact: "increase", costNote: "see drawing", timeImpact: "increase" });
  assert.equal(unstated.requestedAmount, 0);
  assert.equal(unstated.notes.length, 2);
});

test("parseAmount", () => {
  assert.equal(parseAmount("about PHP 1,250.50"), 1250.5);
  assert.equal(parseAmount("no number"), null);
  assert.equal(parseAmount(null), null);
});
