import type { PayrollRules } from "./engine.js";
import type { ValidationIssue } from "./types.js";
import { PAYROLL_WARNINGS, type PayrollWarningConfig } from "../../../core/config/payroll.js";

export interface ValidationLine {
  empId: string;
  name: string;
  hours: number;
  overtime: number;
  net: number;
  rateVersions: Record<string, string> | null;
}

export interface ValidationEmployee {
  status: string;
  payRate: number;
  /** employees.role, the position (Mason, Foreman...). */
  position?: string | null;
  /** Hourly | Daily | Monthly. Pay rates are only comparable within one type. */
  rateType?: string | null;
}

/**
 * Extra facts for the warnings HR must acknowledge before submitting (objectives
 * fix 2.4). All optional: without it only the original checks run.
 */
export interface WarningContext {
  /** Inclusive date range of the payroll period, when the label has one. */
  period: { start: string; end: string } | null;
  /** Count of attendance records in the period that HR has not verified, by employee. */
  unverifiedByEmployee: Map<string, number>;
  /** Pay rates of every Active employee, keyed `position|rateType`, for the same-position comparison. */
  peerRates: Map<string, number[]>;
  config?: PayrollWarningConfig;
}

/** Warning codes that need an explicit acknowledgement before the batch can be submitted. */
export const ACKNOWLEDGED_CODES = ["unverified_attendance", "hours_outlier", "pay_rate_mismatch"] as const;

export const warningKey = (code: string, empId?: string): string => (empId ? `${code}:${empId}` : code);

const php = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Inclusive start/end of a period label: "YYYY-MM" or a label holding two ISO dates. null when unreadable. */
export const periodRange = (period: string): { start: string; end: string } | null => {
  const month = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (month) {
    const last = new Date(Date.UTC(Number(month[1]), Number(month[2]), 0)).getUTCDate();
    return { start: `${month[1]}-${month[2]}-01`, end: `${month[1]}-${month[2]}-${String(last).padStart(2, "0")}` };
  }
  const dates = period.match(/\d{4}-\d{2}-\d{2}/g);
  if (dates && dates.length >= 2) return { start: dates[0]!, end: dates[dates.length - 1]! };
  return null;
};

const inclusiveDays = (start: string, end: string): number =>
  Math.max(1, Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1);

/**
 * Warnings that need acknowledgement: unverified attendance, hours far above what
 * the period allows, and a pay rate far from others in the same position. Pure.
 */
export const payrollWarnings = (
  lines: ValidationLine[],
  employees: Map<string, ValidationEmployee>,
  context: WarningContext,
): ValidationIssue[] => {
  const cfg = context.config ?? PAYROLL_WARNINGS;
  const issues: ValidationIssue[] = [];
  const days = context.period ? inclusiveDays(context.period.start, context.period.end) : cfg.defaultPeriodDays;
  const hourCap = days * cfg.maxHoursPerDay;

  for (const line of lines) {
    const who = `${line.name} (${line.empId})`;
    const employee = employees.get(line.empId);

    const unverified = context.unverifiedByEmployee.get(line.empId) ?? 0;
    if (unverified > 0) {
      issues.push({
        severity: "warning",
        code: "unverified_attendance",
        key: warningKey("unverified_attendance", line.empId),
        requiresAck: true,
        empId: line.empId,
        message: `${who} has ${unverified} attendance record${unverified === 1 ? "" : "s"} in this period that HR has not verified.`,
      });
    }

    const total = line.hours + line.overtime;
    if (total > hourCap) {
      issues.push({
        severity: "warning",
        code: "hours_outlier",
        key: warningKey("hours_outlier", line.empId),
        requiresAck: true,
        empId: line.empId,
        message: `${who} has ${total} hours in a ${days}-day period, more than ${hourCap} (${cfg.maxHoursPerDay} hours a day).`,
      });
    } else if (total > 0 && line.overtime / total > cfg.maxOvertimeShare) {
      issues.push({
        severity: "warning",
        code: "hours_outlier",
        key: warningKey("hours_outlier", line.empId),
        requiresAck: true,
        empId: line.empId,
        message: `${who} has ${line.overtime} overtime hours out of ${total}, more than ${Math.round(cfg.maxOvertimeShare * 100)}% of the total.`,
      });
    }

    if (employee?.position && employee.rateType && employee.payRate > 0) {
      const peers = context.peerRates.get(`${employee.position}|${employee.rateType}`) ?? [];
      if (peers.length >= cfg.minPeers) {
        const mid = median(peers);
        const diffPct = (Math.abs(employee.payRate - mid) / mid) * 100;
        if (mid > 0 && diffPct > cfg.rateTolerancePct) {
          issues.push({
            severity: "warning",
            code: "pay_rate_mismatch",
            key: warningKey("pay_rate_mismatch", line.empId),
            requiresAck: true,
            empId: line.empId,
            message: `${who} is paid ${php(employee.payRate)} (${employee.rateType.toLowerCase()}), ${Math.round(diffPct)}% ${employee.payRate > mid ? "above" : "below"} the median ${php(mid)} for ${peers.length} ${employee.position}s.`,
          });
        }
      }
    }
  }
  return issues;
};

/**
 * Pre-submission checks, phrased for HR. Errors block submission; warnings
 * need acknowledgement (duplicate batch, and, when a context is supplied,
 * unverified attendance, hours outliers and pay-rate mismatches) or are
 * informational.
 */
export const validateBatchLines = (
  lines: ValidationLine[],
  employees: Map<string, ValidationEmployee>,
  rules: PayrollRules,
  duplicateBatchIds: string[],
  warningContext?: WarningContext,
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (lines.length === 0) {
    issues.push({
      severity: "error",
      code: "no_lines",
      message: "The batch has no employees. Add at least one employee before submitting.",
    });
  }

  for (const line of lines) {
    const employee = employees.get(line.empId);
    const who = `${line.name} (${line.empId})`;

    if (!employee) {
      issues.push({
        severity: "error",
        code: "employee_missing",
        message: `${who} no longer exists in the employee roster.`,
        empId: line.empId,
      });
      continue;
    }
    if (employee.status !== "Active") {
      issues.push({
        severity: "error",
        code: "employee_not_active",
        message: `${who} is "${employee.status}", not Active, so cannot be paid in this batch.`,
        empId: line.empId,
      });
    }
    if (!(employee.payRate > 0)) {
      issues.push({
        severity: "error",
        code: "pay_rate_missing",
        message: `${who} has no pay rate (₱0). HR must set a pay rate first.`,
        empId: line.empId,
      });
    }
    if (line.hours + line.overtime <= 0) {
      issues.push({
        severity: "error",
        code: "zero_hours",
        message: `${who} has zero regular and overtime hours.`,
        empId: line.empId,
      });
    }
    if (line.net < 0) {
      issues.push({
        severity: "error",
        code: "negative_net",
        message: `${who} would have negative net pay.`,
        empId: line.empId,
      });
    }
    const versions = line.rateVersions;
    if (!versions || !versions.sss || !versions.philhealth || !versions.pagibig) {
      issues.push({
        severity: "error",
        code: "missing_rate_version",
        message: `${who} has no recorded rate version for every agency. Recalculate the line.`,
        empId: line.empId,
      });
    }
  }

  if (duplicateBatchIds.length) {
    issues.push({
      severity: "warning",
      code: "duplicate_batch",
      message: `Another batch already exists for this project and period (${duplicateBatchIds.join(", ")}). Submitting needs your confirmation.`,
    });
  }

  if (warningContext) issues.push(...payrollWarnings(lines, employees, warningContext));

  for (const item of rules.needsVerification) {
    issues.push({
      severity: "warning",
      code: "needs_verification",
      message: `Rate value needs verification: ${item}.`,
    });
  }

  return issues;
};

/** The warnings in `issues` that still need acknowledging, given the keys HR ticked. */
export const unacknowledged = (issues: ValidationIssue[], acknowledged: readonly string[]): ValidationIssue[] => {
  const ticked = new Set(acknowledged);
  return issues.filter((i) => i.requiresAck && i.key && !ticked.has(i.key));
};
