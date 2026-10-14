import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeLine, getRules } from "./engine.js";
import { buildTrace, splitDay, type TraceAttendance, type TraceLine } from "./trace.js";

const rules = getRules("2026-07-31");
const employee = { payRate: 800, rateType: "Daily" }; // 100 per hour

const storedLine = (over: Partial<TraceLine> = {}): TraceLine => {
  const c = computeLine({ payRate: 800, rateType: "Daily", regularHours: 16, overtimeHours: 2, adjustments: 0 }, rules);
  return {
    hours: 16,
    overtime: 2,
    adjustments: 0,
    gross: c.gross,
    sss: c.sss,
    philhealth: c.philhealth,
    pagibig: c.pagibig,
    deductions: c.deductions,
    net: c.net,
    employerSss: c.employerSss,
    employerEc: c.employerEc,
    employerPhilhealth: c.employerPhilhealth,
    employerPagibig: c.employerPagibig,
    employerCost: c.employerCost,
    rateVersions: { ...c.versions },
    ...over,
  };
};

const day = (id: number, date: string, hours: number, verification = "Verified", attendanceStatus = "Present"): TraceAttendance => ({
  id,
  logDate: date,
  clockIn: "08:00",
  clockOut: "17:00",
  hours,
  attendanceStatus,
  verification,
});

describe("trace steps", () => {
  test("shows the hourly rate, each pay part and the stored figures with the rate versions", () => {
    const t = buildTrace({ line: storedLine(), employee, attendance: [], rules });
    const by = Object.fromEntries(t.steps.map((s) => [s.label, s]));
    assert.equal(by["Hourly rate"]!.amount, 100);
    assert.match(by["Hourly rate"]!.formula, /per day/);
    assert.equal(by["Regular pay"]!.amount, 1600);
    assert.equal(by["Overtime pay"]!.amount, 300); // 2 x 100 x 1.5
    assert.equal(by["Gross pay"]!.amount, 1900);
    assert.deepEqual(t.rateVersions, storedLine().rateVersions);
  });

  test("a monthly rate is explained through working days and hours", () => {
    const t = buildTrace({ line: storedLine(), employee: { payRate: 26_400, rateType: "Monthly" }, attendance: [], rules });
    assert.match(t.steps[0]!.formula, /22 days/);
  });
});

describe("attendance behind the hours", () => {
  test("splits each verified day at the standard shift and ignores unverified ones", () => {
    assert.deepEqual(splitDay(9, 8), { regular: 8, overtime: 1 });
    assert.deepEqual(splitDay(6, 8), { regular: 6, overtime: 0 });
    const t = buildTrace({
      line: storedLine({ hours: 16, overtime: 2 }),
      employee,
      attendance: [day(1, "2026-07-02", 9), day(2, "2026-07-01", 9), day(3, "2026-07-03", 8, "Pending")],
      rules,
    });
    assert.deepEqual(t.attendance.map((a) => a.logDate), ["2026-07-01", "2026-07-02", "2026-07-03"]); // sorted
    assert.equal(t.attendanceTotals.regular, 16);
    assert.equal(t.attendanceTotals.overtime, 2);
    assert.equal(t.attendanceTotals.unverifiedRecords, 1);
    assert.equal(t.attendance[2]!.counted, false);
    assert.match(t.hoursNote, /match the verified attendance/);
  });

  test("hours that differ from verified attendance are called out", () => {
    const t = buildTrace({ line: storedLine({ hours: 40, overtime: 0 }), employee, attendance: [day(1, "2026-07-01", 8)], rules });
    assert.match(t.hoursNote, /verified attendance supports 8 and 0/);
  });

  test("no attendance at all says the hours were entered by HR", () => {
    const t = buildTrace({ line: storedLine(), employee, attendance: [], rules });
    assert.match(t.hoursNote, /entered by HR/);
  });
});

describe("recomputation check", () => {
  test("matches when nothing changed", () => {
    const t = buildTrace({ line: storedLine(), employee, attendance: [], rules });
    assert.equal(t.recomputed.matches, true);
    assert.deepEqual(t.recomputed.differences, []);
  });

  test("shows a difference when the pay rate changed after the line was built", () => {
    const t = buildTrace({ line: storedLine(), employee: { payRate: 1000, rateType: "Daily" }, attendance: [], rules });
    assert.equal(t.recomputed.matches, false);
    assert.ok(t.recomputed.differences.some((d) => d.startsWith("gross pay: stored")));
  });
});
