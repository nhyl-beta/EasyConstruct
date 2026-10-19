// apps/api/src/attendance/exceptions.ts: pure, no I/O (objectives fix 2.3)
//
// Flags attendance records and gaps that HR should look at. It only reports:
// nothing here writes an absence or changes a record. Likely absences are
// listed for HR to confirm one by one ("Mark absent" in the attendance
// service); the system never records an absence on its own.
import { ATTENDANCE_RULES, type AttendanceRules } from "../config/attendance.js";
import { addDaysIso } from "../utils/dates.js";

export const EXCEPTION_KINDS = [
  "missing_clock_out",
  "late",
  "outside_geofence",
  "duplicate_entry",
  "missing_photo",
  "absent_task_due",
  "likely_absent",
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export interface AttendanceRow {
  id: number;
  employeeId: string;
  logDate: string;
  clockIn: string;
  clockOut: string | null;
  geofence: string;
  photo: string;
  photoUrl: string | null;
  attendanceStatus: string;
  /** "Clock-in" (live, has a photo) or "Sheet"/"HR" (no photo by design). */
  source: string;
  projectCode: string | null;
}

export interface AttendanceException {
  kind: ExceptionKind;
  /** The record the flag is about; null for a likely absence (there is no record). */
  recordId: number | null;
  employeeId: string;
  logDate: string;
  projectCode: string | null;
  message: string;
}

/** Someone expected on site who has no attendance record for a day. */
export interface ExpectedWorker {
  employeeId: string;
  name: string;
  userId: number;
  projectCode: string;
}

export interface OpenTaskDue {
  assignedToUserId: number | null;
  title: string;
  dueDate: string | null;
  status: string;
}

const PRESENT_LIKE = new Set(["Present", "Late", "Half Day"]);

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h < 24 && min >= 0 && min < 60 ? h * 60 + min : null;
};

/** Day of week (0 = Sunday) of a YYYY-MM-DD date. */
export const dayOfWeek = (iso: string): number => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();

/** Record-level flags: missing clock-out, late, outside geofence, duplicates, missing photo. */
export const detectRecordExceptions = (
  rows: AttendanceRow[],
  today: string,
  rules: AttendanceRules = ATTENDANCE_RULES,
): AttendanceException[] => {
  const out: AttendanceException[] = [];
  const lateAfter = (toMinutes(rules.shiftStart) ?? 8 * 60) + rules.lateGraceMinutes;

  for (const r of rows) {
    const base = { recordId: r.id, employeeId: r.employeeId, logDate: r.logDate, projectCode: r.projectCode };
    const worked = PRESENT_LIKE.has(r.attendanceStatus);

    // A day that has ended with no clock-out. Today is still in progress.
    if (worked && !r.clockOut && r.logDate < today) {
      out.push({ ...base, kind: "missing_clock_out", message: `Clocked in at ${r.clockIn} but never clocked out.` });
    }

    // Late: a live clock-in after the shift start plus the grace period.
    const inMinutes = toMinutes(r.clockIn);
    if (worked && r.source === "Clock-in" && inMinutes != null && inMinutes > lateAfter) {
      const minutesLate = inMinutes - (lateAfter - rules.lateGraceMinutes);
      out.push({
        ...base,
        kind: "late",
        message: `Clocked in at ${r.clockIn}, ${minutesLate} minutes after the ${rules.shiftStart} shift start.`,
      });
    }

    if (r.geofence === "Outside") {
      out.push({ ...base, kind: "outside_geofence", message: "Clocked in outside the project geofence." });
    }

    // Live clock-ins must carry a verification photo; sheet and HR entries have none by design.
    if (r.source === "Clock-in" && worked && (!r.photoUrl || r.photo === "Failed")) {
      out.push({
        ...base,
        kind: "missing_photo",
        message: r.photo === "Failed" ? "The verification photo failed." : "No verification photo on file.",
      });
    }
  }

  // Duplicates: more than one record for one person on one day.
  const byPersonDay = new Map<string, AttendanceRow[]>();
  for (const r of rows) {
    const key = `${r.employeeId}|${r.logDate}`;
    byPersonDay.set(key, [...(byPersonDay.get(key) ?? []), r]);
  }
  for (const group of byPersonDay.values()) {
    if (group.length < 2) continue;
    for (const r of group) {
      out.push({
        kind: "duplicate_entry",
        recordId: r.id,
        employeeId: r.employeeId,
        logDate: r.logDate,
        projectCode: r.projectCode,
        message: `${group.length} records for this person on ${r.logDate}.`,
      });
    }
  }
  return out;
};

/**
 * People expected on site on `date` with no record at all. Skipped when the day
 * is not a working day, is in the future, or is today before the cutoff time.
 * `nowTime` is the current Manila time as HH:mm.
 */
export const likelyAbsences = (
  expected: ExpectedWorker[],
  rows: AttendanceRow[],
  date: string,
  today: string,
  nowTime: string,
  rules: AttendanceRules = ATTENDANCE_RULES,
): AttendanceException[] => {
  if (date > today) return [];
  if (!rules.workingDays.includes(dayOfWeek(date))) return [];
  if (date === today && (toMinutes(nowTime) ?? 0) < (toMinutes(rules.absenceCutoff) ?? 12 * 60)) return [];

  const recorded = new Set(rows.filter((r) => r.logDate === date).map((r) => r.employeeId));
  return expected
    .filter((w) => !recorded.has(w.employeeId))
    .map((w) => ({
      kind: "likely_absent" as const,
      recordId: null,
      employeeId: w.employeeId,
      logDate: date,
      projectCode: w.projectCode,
      message: `${w.name} has no attendance record for ${date}.`,
    }));
};

/**
 * Absent (recorded or likely) on a day when the person has an unfinished task
 * due. The task is the reason it matters; the absence itself is not judged.
 */
export const absentWhileTaskDue = (
  absences: AttendanceException[],
  userIdByEmployee: ReadonlyMap<string, number>,
  openTasks: OpenTaskDue[],
): AttendanceException[] => {
  const out: AttendanceException[] = [];
  for (const a of absences) {
    const userId = userIdByEmployee.get(a.employeeId);
    if (userId == null) continue;
    const due = openTasks.filter((t) => t.assignedToUserId === userId && t.dueDate === a.logDate && t.status !== "Completed");
    if (due.length === 0) continue;
    out.push({
      kind: "absent_task_due",
      recordId: a.recordId,
      employeeId: a.employeeId,
      logDate: a.logDate,
      projectCode: a.projectCode,
      message: `Absent on ${a.logDate} with ${due.length} task${due.length === 1 ? "" : "s"} due that day: ${due
        .slice(0, 3)
        .map((t) => `"${t.title}"`)
        .join(", ")}.`,
    });
  }
  return out;
};

/** The recorded absences among some rows, shaped as exceptions so absentWhileTaskDue can read them. */
export const recordedAbsences = (rows: AttendanceRow[]): AttendanceException[] =>
  rows
    .filter((r) => r.attendanceStatus === "Absent")
    .map((r) => ({
      kind: "likely_absent" as const,
      recordId: r.id,
      employeeId: r.employeeId,
      logDate: r.logDate,
      projectCode: r.projectCode,
      message: "Recorded absent.",
    }));

/** Dates from `from` to `to` inclusive. */
export const datesBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 62; d = addDaysIso(d, 1)) out.push(d);
  return out;
};

/** Counts per kind, for the tab header. */
export const summarizeExceptions = (items: AttendanceException[]): Record<ExceptionKind, number> => {
  const counts = Object.fromEntries(EXCEPTION_KINDS.map((k) => [k, 0])) as Record<ExceptionKind, number>;
  for (const i of items) counts[i.kind] += 1;
  return counts;
};
