// apps/api/src/attendance/exceptions-service.ts (objectives fix 2.3)
//
// Builds the exception list for HR and runs the daily check. Read-only apart
// from one in-app notice to HR per day: absences are never written here. HR
// confirms a likely absence with "Mark absent" (attendance/service.ts markAbsent).
import { ATTENDANCE_RULES } from "../core/config/attendance.js";
import { FEATURES } from "../core/config/features.js";
import { addDaysIso, todayManila } from "../core/utils/dates.js";
import * as notificationsService from "../notifications/service.js";
import { withJobLock } from "../core/jobs/lock.js";
import * as repo from "./exceptions-repository.js";
import {
  absentWhileTaskDue,
  datesBetween,
  detectRecordExceptions,
  likelyAbsences,
  recordedAbsences,
  summarizeExceptions,
  type AttendanceException,
} from "./exceptions.js";

const nowTimeManila = (now: Date) =>
  now.toLocaleTimeString("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false });

export interface ExceptionView extends AttendanceException {
  employeeName: string;
}

export const getExceptions = async (opts: { from?: string; to?: string } = {}, now: Date = new Date()) => {
  const today = todayManila(now);
  const to = opts.to && opts.to <= today ? opts.to : today;
  const from = opts.from && opts.from <= to ? opts.from : addDaysIso(to, -(ATTENDANCE_RULES.lookbackDays - 1));
  const dates = datesBetween(from, to);

  const [rows, expected, openTasks] = await Promise.all([
    repo.findRows(from, to),
    repo.findExpectedWorkers(),
    repo.findOpenTasksDue(from, to),
  ]);

  const likely = dates.flatMap((d) => likelyAbsences(expected, rows, d, today, nowTimeManila(now)));
  const recordLevel = detectRecordExceptions(rows, today);
  const names = await repo.findNames([...recordLevel, ...likely, ...recordedAbsences(rows)].map((e) => e.employeeId));
  const userIdByEmployee = new Map<string, number>();
  for (const [employeeId, v] of names) if (v.userId != null) userIdByEmployee.set(employeeId, v.userId);
  for (const w of expected) userIdByEmployee.set(w.employeeId, w.userId);

  const withTasks = absentWhileTaskDue([...likely, ...recordedAbsences(rows)], userIdByEmployee, openTasks);
  const all = [...recordLevel, ...likely, ...withTasks];

  const items: ExceptionView[] = all
    .map((e) => ({ ...e, employeeName: names.get(e.employeeId)?.name ?? expected.find((w) => w.employeeId === e.employeeId)?.name ?? e.employeeId }))
    .sort((a, b) => b.logDate.localeCompare(a.logDate) || a.employeeName.localeCompare(b.employeeName));

  return { from, to, rules: { shiftStart: ATTENDANCE_RULES.shiftStart, lateGraceMinutes: ATTENDANCE_RULES.lateGraceMinutes }, summary: summarizeExceptions(all), items };
};

const LOCK_KEY = 74_2025_03;
const NOTICE_TITLE = "Attendance exceptions to review";

/**
 * Daily check: counts the last two days of exceptions and likely absences, and
 * tells HR in-app once per day when there are any. Writes no attendance record.
 */
export const runDailyCheck = async (now: Date = new Date()) => {
  if (!FEATURES.ai) return null;
  return withJobLock(LOCK_KEY, async () => {
    const today = todayManila(now);
    const result = await getExceptions({ from: addDaysIso(today, -1), to: today }, now);
    const flagged = result.items.length;
    const likely = result.summary.likely_absent;

    let notified = false;
    if (flagged > 0) {
      const startOfToday = new Date(`${today}T00:00:00+08:00`);
      if (!(await repo.roleNoticeSince("human-resources", NOTICE_TITLE, startOfToday))) {
        await notificationsService.create({
          recipientRole: "human-resources",
          title: NOTICE_TITLE,
          body: `${flagged} attendance item${flagged === 1 ? "" : "s"} need a look, including ${likely} likely absence${likely === 1 ? "" : "s"}. Nothing is recorded until you confirm it.`,
          link: "/attendance",
        });
        notified = true;
      }
    }
    return { checked: `${result.from} to ${result.to}`, flagged, likelyAbsences: likely, notified };
  });
};
