import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { getRules } from "./engine.js";
import {
  median,
  payrollWarnings,
  periodRange,
  unacknowledged,
  validateBatchLines,
  warningKey,
  type ValidationEmployee,
  type ValidationLine,
  type WarningContext,
} from "./validation.js";
import type { PayrollWarningConfig } from "../core/config/payroll.js";

const CFG: PayrollWarningConfig = { maxHoursPerDay: 12, defaultPeriodDays: 31, maxOvertimeShare: 0.5, rateTolerancePct: 25, minPeers: 3 };

const line = (over: Partial<ValidationLine> = {}): ValidationLine => ({
  empId: "E1",
  name: "Ana",
  hours: 160,
  overtime: 10,
  net: 1000,
  rateVersions: { sss: "a", philhealth: "b", pagibig: "c" },
  ...over,
});
const emp = (over: Partial<ValidationEmployee> = {}): ValidationEmployee => ({
  status: "Active",
  payRate: 130,
  position: "Mason",
  rateType: "Hourly",
  ...over,
});
const ctx = (over: Partial<WarningContext> = {}): WarningContext => ({
  period: { start: "2026-07-01", end: "2026-07-31" },
  unverifiedByEmployee: new Map(),
  peerRates: new Map([["Mason|Hourly", [120, 130, 135, 140, 125]]]),
  config: CFG,
  ...over,
});
const run = (l: ValidationLine, e: ValidationEmployee, c: WarningContext) => payrollWarnings([l], new Map([[l.empId, e]]), c);

describe("unverified attendance", () => {
  test("is flagged with the count, and needs acknowledgement", () => {
    const out = run(line(), emp(), ctx({ unverifiedByEmployee: new Map([["E1", 3]]) }));
    assert.equal(out.length, 1);
    assert.equal(out[0]!.code, "unverified_attendance");
    assert.equal(out[0]!.key, "unverified_attendance:E1");
    assert.equal(out[0]!.requiresAck, true);
    assert.match(out[0]!.message, /3 attendance records/);
  });
  test("a person with everything verified raises nothing", () => {
    assert.deepEqual(run(line(), emp(), ctx()), []);
  });
});

describe("hours outliers", () => {
  test("more hours than the period allows at the daily cap", () => {
    // July has 31 days: cap 372
    assert.deepEqual(run(line({ hours: 372, overtime: 0 }), emp(), ctx()), []);
    const out = run(line({ hours: 400, overtime: 0 }), emp(), ctx());
    assert.equal(out[0]!.code, "hours_outlier");
    assert.match(out[0]!.message, /more than 372/);
  });
  test("a half-month period has a lower cap", () => {
    const half = ctx({ period: { start: "2026-07-01", end: "2026-07-15" } }); // 15 days -> 180
    assert.equal(run(line({ hours: 200, overtime: 0 }), emp(), half)[0]!.code, "hours_outlier");
  });
  test("overtime over half of all hours is flagged", () => {
    const out = run(line({ hours: 40, overtime: 60 }), emp(), ctx());
    assert.equal(out[0]!.code, "hours_outlier");
    assert.match(out[0]!.message, /overtime/);
  });
  test("an unreadable period falls back to the default length", () => {
    assert.equal(run(line({ hours: 380, overtime: 0 }), emp(), ctx({ period: null }))[0]!.code, "hours_outlier");
  });
});

describe("pay-rate mismatch within a position", () => {
  test("far above or below the median of the same position and rate type", () => {
    const high = run(line(), emp({ payRate: 200 }), ctx());
    assert.equal(high[0]!.code, "pay_rate_mismatch");
    assert.match(high[0]!.message, /above the median/);
    const low = run(line(), emp({ payRate: 70 }), ctx());
    assert.match(low[0]!.message, /below the median/);
  });
  test("within tolerance is fine", () => {
    assert.deepEqual(run(line(), emp({ payRate: 140 }), ctx()), []);
  });
  test("too few peers, or a different rate type, skips the comparison", () => {
    assert.deepEqual(run(line(), emp({ payRate: 300 }), ctx({ peerRates: new Map([["Mason|Hourly", [120, 130]]]) })), []);
    assert.deepEqual(run(line(), emp({ payRate: 300, rateType: "Daily" }), ctx()), []);
  });
});

describe("integration with the existing checks", () => {
  const rules = getRules("2026-07-31");
  const employees = new Map([["E1", emp({ payRate: 200 })]]);

  test("errors still come first and warnings do not block on their own", () => {
    const issues = validateBatchLines([line()], employees, rules, [], ctx());
    assert.equal(issues.filter((i) => i.severity === "error").length, 0);
    assert.ok(issues.some((i) => i.code === "pay_rate_mismatch" && i.severity === "warning"));
  });

  test("without a context only the original checks run (backward compatible)", () => {
    const issues = validateBatchLines([line()], employees, rules, []);
    assert.ok(!issues.some((i) => i.requiresAck));
  });

  test("unacknowledged() lists what is still unticked", () => {
    const issues = validateBatchLines([line({ hours: 400, overtime: 0 })], employees, rules, [], ctx());
    const keys = issues.filter((i) => i.requiresAck).map((i) => i.key!);
    assert.deepEqual(keys.sort(), ["hours_outlier:E1", "pay_rate_mismatch:E1"]);
    assert.equal(unacknowledged(issues, []).length, 2);
    assert.equal(unacknowledged(issues, ["hours_outlier:E1"]).length, 1);
    assert.equal(unacknowledged(issues, keys).length, 0);
  });

  test("the duplicate-batch warning still works the old way (not via acknowledgement)", () => {
    const issues = validateBatchLines([line()], new Map([["E1", emp()]]), rules, ["PAY-1"], ctx());
    const dup = issues.find((i) => i.code === "duplicate_batch")!;
    assert.equal(dup.requiresAck, undefined);
  });
});

test("helpers", () => {
  assert.deepEqual(periodRange("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(periodRange("Jul 1 2026-07-01 to 2026-07-15"), { start: "2026-07-01", end: "2026-07-15" });
  assert.equal(periodRange("Jul 20-26, 2026"), null);
  assert.equal(median([1, 3, 2]), 2);
  assert.equal(warningKey("x", "E1"), "x:E1");
  assert.equal(warningKey("x"), "x");
});
