import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  absentWhileTaskDue,
  dayOfWeek,
  datesBetween,
  detectRecordExceptions,
  likelyAbsences,
  recordedAbsences,
  summarizeExceptions,
  type AttendanceRow,
  type ExpectedWorker,
} from "./exceptions.js";
import type { AttendanceRules } from "../core/config/attendance.js";

const RULES: AttendanceRules = {
  shiftStart: "08:00",
  lateGraceMinutes: 15,
  workingDays: [1, 2, 3, 4, 5, 6],
  absenceCutoff: "12:00",
  lookbackDays: 7,
};
const TODAY = "2026-10-14"; // a Wednesday

const row = (over: Partial<AttendanceRow> = {}): AttendanceRow => ({
  id: 1,
  employeeId: "E-1",
  logDate: "2026-10-13",
  clockIn: "07:55",
  clockOut: "17:00",
  geofence: "Inside",
  photo: "Verified",
  photoUrl: "https://x/p.jpg",
  attendanceStatus: "Present",
  source: "Clock-in",
  projectCode: "P-1",
  ...over,
});

const kinds = (rows: AttendanceRow[]) => detectRecordExceptions(rows, TODAY, RULES).map((e) => e.kind);

describe("record exceptions", () => {
  test("a clean record raises nothing", () => {
    assert.deepEqual(kinds([row()]), []);
  });

  test("missing clock-out on a finished day, but not today", () => {
    assert.deepEqual(kinds([row({ clockOut: null })]), ["missing_clock_out"]);
    assert.deepEqual(kinds([row({ clockOut: null, logDate: TODAY })]), []);
  });

  test("late means after the shift start plus the grace period", () => {
    assert.deepEqual(kinds([row({ clockIn: "08:15" })]), []);
    const late = detectRecordExceptions([row({ clockIn: "08:30" })], TODAY, RULES);
    assert.deepEqual(late.map((e) => e.kind), ["late"]);
    assert.match(late[0]!.message, /30 minutes after the 08:00 shift start/);
  });

  test("a sheet entry is not judged on lateness or photo", () => {
    assert.deepEqual(kinds([row({ source: "Sheet", clockIn: "09:30", photoUrl: null, photo: "Not captured" })]), []);
  });

  test("the shift start is configurable", () => {
    const night = { ...RULES, shiftStart: "20:00" };
    assert.deepEqual(detectRecordExceptions([row({ clockIn: "20:10" })], TODAY, night), []);
    assert.deepEqual(detectRecordExceptions([row({ clockIn: "20:40" })], TODAY, night).map((e) => e.kind), ["late"]);
  });

  test("outside the geofence", () => {
    assert.deepEqual(kinds([row({ geofence: "Outside" })]), ["outside_geofence"]);
    assert.deepEqual(kinds([row({ geofence: "Unverified" })]), []);
  });

  test("a live clock-in with no photo, or a failed one", () => {
    assert.deepEqual(kinds([row({ photoUrl: null })]), ["missing_photo"]);
    assert.deepEqual(kinds([row({ photo: "Failed" })]), ["missing_photo"]);
  });

  test("two records for one person on one day are both flagged as duplicates", () => {
    const out = detectRecordExceptions([row({ id: 1 }), row({ id: 2 })], TODAY, RULES).filter((e) => e.kind === "duplicate_entry");
    assert.deepEqual(out.map((e) => e.recordId).sort(), [1, 2]);
    assert.equal(detectRecordExceptions([row({ id: 1 }), row({ id: 2, logDate: "2026-10-12" })], TODAY, RULES).length, 0);
  });

  test("an absent or on-leave record needs no clock-out, time or photo", () => {
    assert.deepEqual(kinds([row({ attendanceStatus: "Absent", clockIn: "00:00", clockOut: null, photoUrl: null })]), []);
  });
});

describe("likely absences", () => {
  const expected: ExpectedWorker[] = [
    { employeeId: "E-1", name: "Ana", userId: 1, projectCode: "P-1" },
    { employeeId: "E-2", name: "Ben", userId: 2, projectCode: "P-1" },
  ];

  test("lists expected workers with no record that day", () => {
    const out = likelyAbsences(expected, [row({ employeeId: "E-1", logDate: "2026-10-13" })], "2026-10-13", TODAY, "19:00", RULES);
    assert.deepEqual(out.map((e) => e.employeeId), ["E-2"]);
    assert.equal(out[0]!.recordId, null);
    assert.equal(out[0]!.kind, "likely_absent");
  });

  test("today is only judged after the cutoff", () => {
    assert.equal(likelyAbsences(expected, [], TODAY, TODAY, "09:00", RULES).length, 0);
    assert.equal(likelyAbsences(expected, [], TODAY, TODAY, "12:00", RULES).length, 2);
  });

  test("non-working days and future days are skipped", () => {
    assert.equal(dayOfWeek("2026-10-18"), 0); // Sunday
    assert.equal(likelyAbsences(expected, [], "2026-10-18", "2026-10-20", "19:00", RULES).length, 0);
    assert.equal(likelyAbsences(expected, [], "2026-10-20", TODAY, "19:00", RULES).length, 0);
  });

  test("it only lists: no record is created by this rule", () => {
    const out = likelyAbsences(expected, [], "2026-10-13", TODAY, "19:00", RULES);
    assert.ok(out.every((e) => e.recordId === null));
  });
});

describe("absent while a task is due", () => {
  const tasks = [
    { assignedToUserId: 2, title: "Pour slab", dueDate: "2026-10-13", status: "In Progress" },
    { assignedToUserId: 2, title: "Done already", dueDate: "2026-10-13", status: "Completed" },
    { assignedToUserId: 2, title: "Next week", dueDate: "2026-10-20", status: "Pending" },
    { assignedToUserId: 9, title: "Someone else", dueDate: "2026-10-13", status: "Pending" },
  ];
  const users = new Map([["E-2", 2]]);

  test("flags a likely absence with an unfinished task due that day", () => {
    const absences = likelyAbsences(
      [{ employeeId: "E-2", name: "Ben", userId: 2, projectCode: "P-1" }],
      [],
      "2026-10-13",
      TODAY,
      "19:00",
      RULES,
    );
    const out = absentWhileTaskDue(absences, users, tasks);
    assert.equal(out.length, 1);
    assert.match(out[0]!.message, /1 task due that day: "Pour slab"/);
  });

  test("a recorded absence counts too, and no task due means no flag", () => {
    const abs = recordedAbsences([row({ id: 5, employeeId: "E-2", attendanceStatus: "Absent", logDate: "2026-10-13" })]);
    assert.equal(absentWhileTaskDue(abs, users, tasks).length, 1);
    assert.equal(absentWhileTaskDue(abs, users, []).length, 0);
  });
});

test("helpers", () => {
  assert.deepEqual(datesBetween("2026-10-12", "2026-10-14"), ["2026-10-12", "2026-10-13", "2026-10-14"]);
  const s = summarizeExceptions(detectRecordExceptions([row({ geofence: "Outside", clockOut: null })], TODAY, RULES));
  assert.equal(s.outside_geofence, 1);
  assert.equal(s.missing_clock_out, 1);
  assert.equal(s.late, 0);
});
