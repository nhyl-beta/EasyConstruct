// Payroll pre-submit warning thresholds (payroll/validation.ts). Env-overridable
// so HR can match the real working pattern without a code change. These only
// raise warnings that HR acknowledges; they never block a submission.
const num = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const PAYROLL_WARNINGS = {
  /** Total (regular + overtime) hours per calendar day of the period above which a line is an outlier (PAYROLL_MAX_HOURS_PER_DAY). */
  maxHoursPerDay: num(process.env.PAYROLL_MAX_HOURS_PER_DAY, 12),
  /** Days assumed when a period label has no readable date range. */
  defaultPeriodDays: 31,
  /** Overtime larger than this share of the line's total hours is flagged (PAYROLL_MAX_OVERTIME_SHARE). */
  maxOvertimeShare: num(process.env.PAYROLL_MAX_OVERTIME_SHARE, 0.5),
  /** A pay rate this far from the median of the same position and rate type is a mismatch (PAYROLL_RATE_TOLERANCE_PCT, percent). */
  rateTolerancePct: num(process.env.PAYROLL_RATE_TOLERANCE_PCT, 25),
  /** Fewest people in a position needed before a median means anything. */
  minPeers: 3,
} as const;

export type PayrollWarningConfig = {
  maxHoursPerDay: number;
  defaultPeriodDays: number;
  maxOvertimeShare: number;
  rateTolerancePct: number;
  minPeers: number;
};
