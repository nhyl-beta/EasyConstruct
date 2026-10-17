// server/src/reports/periods.ts: pure, no I/O (client demo change #10)
//
// PM daily, weekly and monthly reports: which period a date falls in, which periods a project is expected to
// have a report for, and which of those are missing. Dates are plain YYYY-MM-DD strings (Manila calendar days)
// and the arithmetic is done in UTC so the server's own timezone never moves a day.

export const REPORT_PERIODS = ["daily", "weekly", "monthly"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** The document type each period is filed under (document types, category "Reports"). */
export const REPORT_TYPE_BY_PERIOD: Record<ReportPeriod, string> = {
  daily: "Daily Report",
  weekly: "Weekly Report",
  monthly: "Monthly Report",
};

export const periodForType = (type: string): ReportPeriod | null =>
  (REPORT_PERIODS.find((p) => REPORT_TYPE_BY_PERIOD[p] === type) ?? null);

const DAY_MS = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (value: string): boolean => {
  if (!ISO.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

const toDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date): string => d.toISOString().slice(0, 10);
export const addDays = (iso: string, days: number): string => toIso(new Date(toDate(iso).getTime() + days * DAY_MS));

/** 0 = Sunday ... 6 = Saturday. */
export const weekdayOf = (iso: string): number => toDate(iso).getUTCDay();

/** The Monday of the week a date is in. */
export const weekStart = (iso: string): string => addDays(iso, -((weekdayOf(iso) + 6) % 7));

export const monthStart = (iso: string): string => `${iso.slice(0, 7)}-01`;

/** The day a report for `iso` is filed under: the day itself, that week's Monday, or the month's first day. */
export const periodStart = (period: ReportPeriod, iso: string): string => (period === "daily" ? iso : period === "weekly" ? weekStart(iso) : monthStart(iso));

/** Last day of the period that starts on `start`. */
export const periodEnd = (period: ReportPeriod, start: string): string => {
  if (period === "daily") return start;
  if (period === "weekly") return addDays(start, 6);
  const d = toDate(start);
  return toIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};

const nextStart = (period: ReportPeriod, start: string): string => addDays(periodEnd(period, start), 1);

/** Working days from REPORT_WORKING_DAYS ("1,2,3,4,5"). Weekends count as working days unless a config says otherwise. */
export const parseWorkingDays = (raw: string | undefined): ReadonlySet<number> => {
  const days = (raw ?? "")
    .split(",")
    .filter((s) => s.trim() !== "")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return new Set(days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6]);
};

/** Phases in which reports are due. A Design project's Closeout is its Turnover. */
const ACTIVE_STATUSES: Record<string, readonly string[]> = {
  Construction: ["Construction", "Closeout"],
  Design: ["Design", "Closeout"],
};

/** Which reports a project owes right now: all three while under construction, weekly and monthly while designing, none otherwise. */
export const applicablePeriods = (deliveryType: string | null | undefined, status: string): ReportPeriod[] => {
  const type = deliveryType === "Design" ? "Design" : "Construction";
  if (!ACTIVE_STATUSES[type]!.includes(status)) return [];
  return type === "Design" ? ["weekly", "monthly"] : ["daily", "weekly", "monthly"];
};

/** The report for a period that has fully ended but is not yet due is not expected: only periods ending before `today` count. */
export const expectedPeriods = (input: {
  period: ReportPeriod;
  /** First day the project was active (the day it entered Construction, or Design). */
  activeFrom: string;
  today: string;
  workingDays?: ReadonlySet<number>;
  /** Furthest back to look, so a long project does not list years of periods. */
  maxPeriods?: number;
}): string[] => {
  const { period, activeFrom, today, workingDays = parseWorkingDays(undefined), maxPeriods = 400 } = input;
  const out: string[] = [];
  let start = periodStart(period, activeFrom);
  while (periodEnd(period, start) < today) {
    // A period counts when the project was active on some day of it.
    if (periodEnd(period, start) >= activeFrom && (period !== "daily" || workingDays.has(weekdayOf(start)))) out.push(start);
    start = nextStart(period, start);
  }
  return out.slice(-maxPeriods);
};

/** Expected periods that have no submitted report. */
export const missingPeriods = (expected: readonly string[], submitted: ReadonlySet<string>): string[] => expected.filter((s) => !submitted.has(s));

/** The latest period that has just ended: yesterday, last week's Monday, last month's first day. */
export const lastCompletedStart = (period: ReportPeriod, today: string): string => {
  if (period === "daily") return addDays(today, -1);
  if (period === "weekly") return addDays(weekStart(today), -7);
  const first = monthStart(today);
  return monthStart(addDays(first, -1));
};

export interface ReportReminder {
  period: ReportPeriod;
  start: string;
}

/**
 * What to remind the PM about today: yesterday's daily report and last week's or last month's report, each only
 * when it is expected for this project and nothing was filed for it.
 */
export const remindersDue = (input: {
  deliveryType: string | null | undefined;
  status: string;
  activeFrom: string;
  today: string;
  workingDays?: ReadonlySet<number>;
  submitted: Record<ReportPeriod, ReadonlySet<string>>;
}): ReportReminder[] => {
  const out: ReportReminder[] = [];
  for (const period of applicablePeriods(input.deliveryType, input.status)) {
    const start = lastCompletedStart(period, input.today);
    const expected = expectedPeriods({ period, activeFrom: input.activeFrom, today: input.today, workingDays: input.workingDays });
    if (expected.includes(start) && !input.submitted[period].has(start)) out.push({ period, start });
  }
  return out;
};

/** What a report upload must say: a known period and a date that is not in the future. The stored date is the period's start. */
export const normalizeReportPeriod = (period: string, date: string, today: string): { period: ReportPeriod; periodDate: string } => {
  if (!(REPORT_PERIODS as readonly string[]).includes(period)) throw new Error("Report period must be daily, weekly or monthly");
  if (!isIsoDate(date)) throw new Error("Report date must be a YYYY-MM-DD date");
  if (date > today) throw new Error("A report cannot be filed for a date in the future");
  return { period: period as ReportPeriod, periodDate: periodStart(period as ReportPeriod, date) };
};

export interface GridCell {
  start: string;
  end: string;
  submitted: boolean;
}

/** The grid the project page shows: each expected period, newest first, green when a report was filed and red when not. */
export const reportGrid = (input: { period: ReportPeriod; activeFrom: string; today: string; submitted: ReadonlySet<string>; workingDays?: ReadonlySet<number>; limit?: number }): GridCell[] => {
  const expected = expectedPeriods({ period: input.period, activeFrom: input.activeFrom, today: input.today, workingDays: input.workingDays });
  return expected
    .slice(-(input.limit ?? 60))
    .reverse()
    .map((start) => ({ start, end: periodEnd(input.period, start), submitted: input.submitted.has(start) }));
};
