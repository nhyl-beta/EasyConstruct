import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bucketByMonth, keyToLabel, labelToKey, lastMonthKeys, latestByCalendar, mergeBuckets, monthKey, payrollCost } from "./months.js";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("month keys and labels", () => {
  test("round trip", () => {
    assert.equal(monthKey(at("2026-03-31")), "2026-03");
    assert.equal(keyToLabel("2026-03"), "Mar 2026");
    assert.equal(labelToKey("Mar 2026"), "2026-03");
    assert.equal(labelToKey("sep 2026"), "2026-09");
    assert.equal(labelToKey("Foo 2026"), null);
    assert.equal(labelToKey("March"), null);
  });
  test("the last six months end at the current month and cross a year boundary", () => {
    assert.deepEqual(lastMonthKeys(6, at("2026-02-10")), ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("bucketing", () => {
  test("sums amounts per calendar month and rounds to centavos", () => {
    const m = bucketByMonth([
      { at: at("2026-01-02"), amount: 100.105 },
      { at: at("2026-01-30"), amount: 50 },
      { at: at("2026-02-01"), amount: 7 },
    ]);
    assert.equal(m.get("2026-01"), 150.11);
    assert.equal(m.get("2026-02"), 7);
  });
  test("merging sources adds the same month", () => {
    const m = mergeBuckets(new Map([["2026-01", 10]]), new Map([["2026-01", 5], ["2026-02", 1]]));
    assert.deepEqual([...m], [["2026-01", 15], ["2026-02", 1]]);
  });
  test("payroll cost is employer cost, or gross for legacy batches", () => {
    assert.equal(payrollCost({ employerCost: 120, grossPayroll: 100 }), 120);
    assert.equal(payrollCost({ employerCost: 0, grossPayroll: 100 }), 100);
  });
});

describe("latest rows by calendar month", () => {
  test("not by insertion order: the newest N come back oldest first", () => {
    const rows = ["Dec 2025", "Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Nov 2025"].map((month) => ({ month }));
    assert.deepEqual(latestByCalendar(rows, 6).map((r) => r.month), ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"]);
  });
  test("rows with an unreadable month are dropped", () => {
    assert.deepEqual(latestByCalendar([{ month: "??" }, { month: "Jan 2026" }], 6).map((r) => r.month), ["Jan 2026"]);
  });
});
