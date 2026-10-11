import type { Payroll } from "../db/schema/payroll.js";

export type PayrollLine = Payroll;

export interface PayrollFilters {
  /** Lines of these batches are hidden (Finance never sees a draft batch's lines). */
  excludeBatchIds?: string[];
  period?: string;
  status?: string;
  empId?: string;
  batchId?: string;
}

// One employee's worked time for a payroll period — HR confirms these
// (typically after reviewing Attendance) and the engine computes every
// money figure. There is deliberately no field for a statutory amount.
export interface PayrollEntryInput {
  employeeId: string; // employees.employeeId
  hoursWorked: number;
  overtimeHours?: number;
  adjustments?: number; // manual +/- adjustment added to gross before deductions
}

export interface GeneratePayrollInput {
  period: string; // e.g. "2026-07"
  group?: string; // department/site label for the Gross Tracking rollup
  projectCode?: string;
  entries: PayrollEntryInput[];
  /** Create the batch already submitted to Finance (demo scripts, API clients). */
  submit?: boolean;
  /** Acknowledge a warning that another batch exists for this project/period. */
  confirmDuplicate?: boolean;
}

// The only inputs a line edit accepts; everything else is recomputed.
export interface UpdatePayrollLineInput {
  hours?: number;
  overtime?: number;
  adjustments?: number;
}

export const BATCH_STATUSES = ["draft", "pending", "approved", "revision_required"] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

/** Statuses in which HR may still change lines. */
export const EDITABLE_BATCH_STATUSES: readonly string[] = ["draft", "revision_required"];

export const REJECTION_REASONS = [
  "attendance_discrepancy",
  "incorrect_basic_pay",
  "incorrect_overtime",
  "incorrect_sss",
  "incorrect_philhealth",
  "incorrect_pagibig",
  "missing_employee_information",
  "incorrect_government_rate",
  "other",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export interface DecideBatchInput {
  decision: "approved" | "rejected";
  reasonCode?: RejectionReason;
  comment?: string;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  empId?: string;
}
