// Attendance exception rules (attendance/exceptions.ts). Every value can be set
// from the environment so HR can match the real shift without a code change.
const int = (value: string | undefined, fallback: number): number => {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

const hhmm = (value: string | undefined, fallback: string): string =>
  value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim()) ? value.trim() : fallback;

const weekdays = (value: string | undefined, fallback: number[]): number[] => {
  if (!value) return fallback;
  const days = value
    .split(",")
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => d >= 0 && d <= 6);
  return days.length > 0 ? days : fallback;
};

export const ATTENDANCE_RULES = {
  /** Shift start, 24-hour HH:mm (ATTENDANCE_SHIFT_START). */
  shiftStart: hhmm(process.env.ATTENDANCE_SHIFT_START, "08:00"),
  /** Minutes after the shift start before a clock-in counts as late (ATTENDANCE_LATE_GRACE_MIN). */
  lateGraceMinutes: int(process.env.ATTENDANCE_LATE_GRACE_MIN, 15),
  /** Days people are expected on site, 0 = Sunday ... 6 = Saturday (ATTENDANCE_WORKING_DAYS). */
  workingDays: weekdays(process.env.ATTENDANCE_WORKING_DAYS, [1, 2, 3, 4, 5, 6]),
  /** Today is only judged for absences from this Manila time on (ATTENDANCE_ABSENCE_CUTOFF). */
  absenceCutoff: hhmm(process.env.ATTENDANCE_ABSENCE_CUTOFF, "12:00"),
  /** How far back the Exceptions tab looks by default. */
  lookbackDays: int(process.env.ATTENDANCE_EXCEPTION_LOOKBACK_DAYS, 7) || 7,
} as const;

export type AttendanceRules = {
  shiftStart: string;
  lateGraceMinutes: number;
  workingDays: readonly number[];
  absenceCutoff: string;
  lookbackDays: number;
};
