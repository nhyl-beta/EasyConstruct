import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { compareRates, fairnessFlags, summarizeFairness, type WorkerProjectRow, type WorkerRate } from "./fairness.js";

const row = (employeeId: string, over: Partial<WorkerProjectRow> = {}): WorkerProjectRow => ({
  employeeId,
  name: `Worker ${employeeId}`,
  position: "Mason",
  projectCode: "P-1",
  days: 20,
  hours: 160,
  overtimeHours: 10,
  tasksAssigned: 5,
  tasksCompleted: 3,
  tasksOpen: 2,
  ...over,
});
const rate = (employeeId: string, payRate: number, over: Partial<WorkerRate> = {}): WorkerRate => ({
  employeeId,
  name: `Worker ${employeeId}`,
  position: "Mason",
  rateType: "Hourly",
  payRate,
  ...over,
});

describe("pay rate against the position median", () => {
  test("flags a rate far from the median and states the sample", () => {
    const positions = compareRates([rate("a", 130), rate("b", 135), rate("c", 140), rate("d", 125), rate("e", 200)]);
    assert.equal(positions.length, 1);
    assert.equal(positions[0]!.median, 135);
    assert.deepEqual(positions[0]!.outliers.map((o) => o.employeeId), ["e"]);
    const flags = fairnessFlags([], positions);
    assert.equal(flags[0]!.kind, "rate_outlier");
    assert.match(flags[0]!.message, /48.1% above the median .*135 for 5 Masons/);
  });

  test("a below-median outlier is flagged as below", () => {
    const flags = summarizeFairness([], [rate("a", 130), rate("b", 135), rate("c", 140), rate("d", 125), rate("e", 70)]).flags;
    assert.match(flags[0]!.message, /below the median/);
  });

  test("too few people, or a different rate type, is not compared", () => {
    assert.deepEqual(compareRates([rate("a", 130), rate("b", 300)]), []);
    const mixed = compareRates([rate("a", 130), rate("b", 135), rate("c", 140, { rateType: "Daily" })]);
    assert.deepEqual(mixed, []);
  });

  test("a zero or missing rate is ignored", () => {
    assert.deepEqual(compareRates([rate("a", 0), rate("b", 0), rate("c", 0)]), []);
  });
});

describe("hours, overtime and tasks per project", () => {
  const crew = [row("a"), row("b"), row("c"), row("d", { hours: 400, overtimeHours: 20, tasksAssigned: 20 }), row("e", { hours: 40 })];

  test("flags a worker far above or below the project average", () => {
    const kinds = fairnessFlags(crew, []).map((f) => `${f.kind}:${f.employeeId}`);
    assert.ok(kinds.includes("hours_high:d"));
    assert.ok(kinds.includes("hours_low:e"));
    assert.ok(kinds.includes("tasks_high:d"));
    assert.ok(!kinds.some((k) => k.endsWith(":a")));
  });

  test("the message names the project average and the number of workers", () => {
    const high = fairnessFlags(crew, []).find((f) => f.kind === "hours_high")!;
    assert.match(high.message, /project average of 184/);
    assert.match(high.message, /5 workers/);
  });

  test("a project with too few workers is not compared", () => {
    const flags = fairnessFlags([row("a"), row("b", { hours: 900 })], []);
    assert.ok(!flags.some((f) => f.kind === "hours_high"));
  });

  test("overtime over the share limit is flagged even on a small crew", () => {
    const flags = fairnessFlags([row("a", { hours: 100, overtimeHours: 60 })], []);
    assert.equal(flags.length, 1);
    assert.equal(flags[0]!.kind, "overtime_high");
    assert.match(flags[0]!.message, /60%/);
  });

  test("nobody working at all gives no flags (no divide by zero)", () => {
    const idle = [row("a", { hours: 0, overtimeHours: 0, tasksAssigned: 0 }), row("b", { hours: 0, overtimeHours: 0, tasksAssigned: 0 }), row("c", { hours: 0, overtimeHours: 0, tasksAssigned: 0 })];
    assert.deepEqual(fairnessFlags(idle, []), []);
  });

  test("it only reports: the result carries no instruction to change anything", () => {
    const out = summarizeFairness(crew, [rate("a", 130), rate("b", 135), rate("c", 140), rate("d", 200)]);
    assert.deepEqual(Object.keys(out).sort(), ["flags", "positions"]);
  });
});
