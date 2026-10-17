import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  applicablePeriods,
  expectedPeriods,
  lastCompletedStart,
  missingPeriods,
  monthStart,
  normalizeReportPeriod,
  parseWorkingDays,
  periodEnd,
  periodForType,
  periodStart,
  remindersDue,
  reportGrid,
  weekStart,
} from "./periods.js";

const none = { daily: new Set<string>(), weekly: new Set<string>(), monthly: new Set<string>() };

describe("period start", () => {
  test("a week starts on Monday, Sunday included in the week before", () => {
    assert.equal(weekStart("2026-10-14"), "2026-10-12"); // Wednesday
    assert.equal(weekStart("2026-10-12"), "2026-10-12"); // Monday
    assert.equal(weekStart("2026-10-18"), "2026-10-12"); // Sunday
    assert.equal(weekStart("2026-10-19"), "2026-10-19");
  });
  test("a month starts on the 1st, across year ends too", () => {
    assert.equal(monthStart("2026-10-31"), "2026-10-01");
    assert.equal(monthStart("2026-01-01"), "2026-01-01");
    assert.equal(weekStart("2026-01-01"), "2025-12-29");
  });
  test("a day is its own period; period ends", () => {
    assert.equal(periodStart("daily", "2026-10-14"), "2026-10-14");
    assert.equal(periodEnd("weekly", "2026-10-12"), "2026-10-18");
    assert.equal(periodEnd("monthly", "2026-02-01"), "2026-02-28");
    assert.equal(periodEnd("monthly", "2028-02-01"), "2028-02-29");
    assert.equal(periodEnd("monthly", "2026-12-01"), "2026-12-31");
  });
  test("each period has its document type", () => {
    assert.equal(periodForType("Weekly Report"), "weekly");
    assert.equal(periodForType("Contract"), null);
  });
});

describe("what a project owes", () => {
  test("Construction and Closeout owe all three; other phases owe nothing", () => {
    assert.deepEqual(applicablePeriods("Construction", "Construction"), ["daily", "weekly", "monthly"]);
    assert.deepEqual(applicablePeriods("Construction", "Closeout"), ["daily", "weekly", "monthly"]);
    assert.deepEqual(applicablePeriods("Construction", "Pre-Construction"), []);
    assert.deepEqual(applicablePeriods("Construction", "Completed"), []);
  });
  test("a Design project owes only weekly and monthly", () => {
    assert.deepEqual(applicablePeriods("Design", "Design"), ["weekly", "monthly"]);
    assert.deepEqual(applicablePeriods("Design", "Closeout"), ["weekly", "monthly"]);
    assert.deepEqual(applicablePeriods("Design", "Proposal"), []);
  });
});

describe("expected periods", () => {
  test("weekends are working days unless configured otherwise", () => {
    // Active from Mon 2026-10-12, today Mon 2026-10-19: the seven days 12..18 have ended.
    assert.equal(expectedPeriods({ period: "daily", activeFrom: "2026-10-12", today: "2026-10-19" }).length, 7);
    const weekdaysOnly = parseWorkingDays("1,2,3,4,5");
    assert.deepEqual(expectedPeriods({ period: "daily", activeFrom: "2026-10-12", today: "2026-10-19", workingDays: weekdaysOnly }), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
  });
  test("today's own report is not due yet", () => {
    assert.deepEqual(expectedPeriods({ period: "daily", activeFrom: "2026-10-19", today: "2026-10-19" }), []);
    assert.deepEqual(expectedPeriods({ period: "daily", activeFrom: "2026-10-18", today: "2026-10-19" }), ["2026-10-18"]);
  });
  test("a week counts once it has fully ended and the project was active in it", () => {
    // Active from Wednesday 14th: the week of the 12th counts (active part of it), ends 18th.
    assert.deepEqual(expectedPeriods({ period: "weekly", activeFrom: "2026-10-14", today: "2026-10-19" }), ["2026-10-12"]);
    assert.deepEqual(expectedPeriods({ period: "weekly", activeFrom: "2026-10-14", today: "2026-10-18" }), []);
  });
  test("a month counts once it has ended", () => {
    assert.deepEqual(expectedPeriods({ period: "monthly", activeFrom: "2026-08-20", today: "2026-10-05" }), ["2026-08-01", "2026-09-01"]);
  });
  test("missing periods are the expected ones nothing was filed for", () => {
    const expected = expectedPeriods({ period: "daily", activeFrom: "2026-10-12", today: "2026-10-16" });
    assert.deepEqual(missingPeriods(expected, new Set(["2026-10-12", "2026-10-14"])), ["2026-10-13", "2026-10-15"]);
    assert.deepEqual(missingPeriods(expected, new Set(expected)), []);
  });
});

describe("what the PM is reminded about", () => {
  test("yesterday, last week and last month are the periods that just ended", () => {
    assert.equal(lastCompletedStart("daily", "2026-10-19"), "2026-10-18");
    assert.equal(lastCompletedStart("weekly", "2026-10-19"), "2026-10-12");
    assert.equal(lastCompletedStart("weekly", "2026-10-21"), "2026-10-12");
    assert.equal(lastCompletedStart("monthly", "2026-10-19"), "2026-09-01");
    assert.equal(lastCompletedStart("monthly", "2026-01-05"), "2025-12-01");
  });
  test("a missing daily, weekly and monthly report each give a reminder", () => {
    const r = remindersDue({ deliveryType: "Construction", status: "Construction", activeFrom: "2026-08-01", today: "2026-10-19", submitted: none });
    assert.deepEqual(r, [
      { period: "daily", start: "2026-10-18" },
      { period: "weekly", start: "2026-10-12" },
      { period: "monthly", start: "2026-09-01" },
    ]);
  });
  test("a report that was filed gives no reminder", () => {
    const r = remindersDue({
      deliveryType: "Construction",
      status: "Construction",
      activeFrom: "2026-08-01",
      today: "2026-10-19",
      submitted: { daily: new Set(["2026-10-18"]), weekly: new Set(["2026-10-12"]), monthly: new Set() },
    });
    assert.deepEqual(r, [{ period: "monthly", start: "2026-09-01" }]);
  });
  test("a Design project is only reminded about weekly and monthly", () => {
    const r = remindersDue({ deliveryType: "Design", status: "Design", activeFrom: "2026-08-01", today: "2026-10-19", submitted: none });
    assert.deepEqual(r.map((x) => x.period), ["weekly", "monthly"]);
  });
  test("a project that just became active owes nothing for the time before it", () => {
    const r = remindersDue({ deliveryType: "Construction", status: "Construction", activeFrom: "2026-10-19", today: "2026-10-19", submitted: none });
    assert.deepEqual(r, []);
  });
  test("a daily report is not expected on a non-working day", () => {
    const sunday = remindersDue({ deliveryType: "Construction", status: "Construction", activeFrom: "2026-08-01", today: "2026-10-19", workingDays: parseWorkingDays("1,2,3,4,5"), submitted: none });
    assert.ok(!sunday.some((x) => x.period === "daily")); // yesterday (the 18th) was a Sunday
  });
  test("a project that is not active gets none", () => {
    assert.deepEqual(remindersDue({ deliveryType: "Construction", status: "Completed", activeFrom: "2026-08-01", today: "2026-10-19", submitted: none }), []);
  });
});

describe("filing a report", () => {
  test("the date is moved to the start of its period", () => {
    assert.deepEqual(normalizeReportPeriod("weekly", "2026-10-15", "2026-10-19"), { period: "weekly", periodDate: "2026-10-12" });
    assert.deepEqual(normalizeReportPeriod("monthly", "2026-09-30", "2026-10-19"), { period: "monthly", periodDate: "2026-09-01" });
    assert.deepEqual(normalizeReportPeriod("daily", "2026-10-19", "2026-10-19"), { period: "daily", periodDate: "2026-10-19" });
  });
  test("an unknown period, a bad date or a future date is refused", () => {
    assert.throws(() => normalizeReportPeriod("yearly", "2026-10-15", "2026-10-19"), /daily, weekly or monthly/);
    assert.throws(() => normalizeReportPeriod("daily", "2026-13-40", "2026-10-19"), /YYYY-MM-DD/);
    assert.throws(() => normalizeReportPeriod("daily", "2026-10-20", "2026-10-19"), /future/);
  });
});

describe("the grid", () => {
  test("newest first, filed periods marked", () => {
    const grid = reportGrid({ period: "daily", activeFrom: "2026-10-12", today: "2026-10-15", submitted: new Set(["2026-10-13"]) });
    assert.deepEqual(grid.map((c) => [c.start, c.submitted]), [["2026-10-14", false], ["2026-10-13", true], ["2026-10-12", false]]);
  });
});
