import type { PayrollRules } from "./engine.js";
import type { ValidationIssue } from "./types.js";

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
}

/**
 * Pre-submission checks, phrased for HR. Errors block submission; warnings
 * need acknowledgement (duplicate batch) or are informational.
 */
export const validateBatchLines = (
  lines: ValidationLine[],
  employees: Map<string, ValidationEmployee>,
  rules: PayrollRules,
  duplicateBatchIds: string[],
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

  for (const item of rules.needsVerification) {
    issues.push({
      severity: "warning",
      code: "needs_verification",
      message: `Rate value needs verification: ${item}.`,
    });
  }

  return issues;
};
