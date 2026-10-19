// apps/api/src/reports/filing.ts: pure, no I/O (client demo change #10)
//
// What a Daily / Weekly / Monthly Report upload must carry. The document type decides the period; the date is
// moved to the start of its period so "the report for Wednesday's week" and "the report for Friday's week" are one.
import { ValidationError } from "../utils/errors.js";
import { manilaDay } from "../jobs/overdue.js";
import { REPORT_TYPE_BY_PERIOD, normalizeReportPeriod, periodForType } from "./periods.js";

/** The report_period / period_date to store for a document of this type (nothing for any other type). */
export const resolveReportFields = (
  type: string,
  reportPeriod: string | undefined,
  periodDate: string | undefined,
  now: Date = new Date(),
): { reportPeriod?: string; periodDate?: string } => {
  const expected = periodForType(type);
  if (!expected) {
    if (reportPeriod || periodDate) throw new ValidationError("A report period only applies to a Daily, Weekly or Monthly Report");
    return {};
  }
  if (reportPeriod && reportPeriod !== expected) {
    throw new ValidationError(`A ${REPORT_TYPE_BY_PERIOD[expected]} covers a ${expected} period, not a ${reportPeriod} one`);
  }
  const today = manilaDay(now);
  try {
    const { period, periodDate: start } = normalizeReportPeriod(expected, periodDate || today, today);
    return { reportPeriod: period, periodDate: start };
  } catch (e) {
    throw new ValidationError(e instanceof Error ? e.message : "Invalid report period");
  }
};
