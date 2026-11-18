import type { AttendanceEntry } from "../attendance-api";

export interface AttendanceDay {
  key: string;
  employeeId: string;
  name: string;
  initials: string;
  logDate: string;
  visits: AttendanceEntry[];
  firstIn: string | null;
  /** null while a visit is still open. */
  lastOut: string | null;
  open: boolean;
  /** Sum of the visits' hours, not last out minus first in. */
  workedHours: number;
  /** Time between first in and last out that was not worked (travel, idle); null while open. */
  gapHours: number | null;
  verified: number;
}

const WORKED = new Set(["Present", "Late", "Half Day"]);
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** One line per person per day, built from that day's visits. shortcut: groups the rows given (one page of the log), so a day split across pages shows partially; upgrade to a server-side day query if pages get small. */
export function groupByDay(rows: AttendanceEntry[]): AttendanceDay[] {
  const days = new Map<string, AttendanceDay>();
  for (const r of rows) {
    const key = `${r.employeeId}|${r.logDate}`;
    const d = days.get(key) ?? { key, employeeId: r.employeeId, name: r.name, initials: r.initials, logDate: r.logDate, visits: [], firstIn: null, lastOut: null, open: false, workedHours: 0, gapHours: null, verified: 0 };
    d.visits.push(r);
    days.set(key, d);
  }
  return [...days.values()].map((d) => {
    d.visits.sort((a, b) => a.clockIn.localeCompare(b.clockIn));
    const worked = d.visits.filter((v) => WORKED.has(v.attendanceStatus));
    const open = worked.some((v) => !v.clockOut);
    const firstIn = worked[0]?.clockIn ?? null;
    const lastOut = open ? null : (worked.map((v) => v.clockOut!).sort().at(-1) ?? null);
    const workedHours = worked.reduce((sum, v) => sum + v.hours, 0);
    const gapHours = firstIn && lastOut ? Math.max((minutes(lastOut) - minutes(firstIn)) / 60 - workedHours, 0) : null;
    return { ...d, firstIn, lastOut, open, workedHours, gapHours, verified: d.visits.filter((v) => v.status === "Verified").length };
  });
}
