import { eq, sql, type AnyColumn } from "drizzle-orm";
import { db } from "../core/db/connection.js";
import { payrollBatches } from "../core/db/schema/finance.js";
import { payroll } from "../core/db/schema/payroll.js";
import { projects } from "../core/db/schema/projects.js";

// One row per batch: the batch's own totals plus SUMs over its lines. The
// line columns selected here are numeric/date columns only. The employee id,
// name, initials and role columns of `payroll` are never selected, so no
// individual pay data can leave this query (the Owner sees aggregates only).

export interface OwnerBatchRow {
  id: string;
  status: string;
  projectCode: string | null;
  projectName: string | null;
  group: string;
  period: string;
  employees: number;
  overtimeHours: number;
  gross: number;
  deductions: number;
  net: number;
  employerCost: number;
  createdAt: Date;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  /** max(payroll.period_end) over the batch's lines; null when no line is dated. */
  linePeriodEnd: string | null;
  lineRegularHours: number;
  sss: number;
  employerSss: number;
  philhealth: number;
  employerPhilhealth: number;
  pagibig: number;
  employerPagibig: number;
  employerEc: number;
}

export const findBatchAggregates = async (): Promise<OwnerBatchRow[]> => {
  const total = (col: AnyColumn, alias: string) =>
    sql<string>`coalesce(sum(${col}), 0)`.as(alias);

  const lines = db
    .select({
      batchId: payroll.batchId,
      periodEnd: sql<string | null>`max(${payroll.periodEnd})`.as("period_end"),
      regularHours: sql<string>`coalesce(sum(${payroll.hours}), 0)`.as("regular_hours"),
      sss: total(payroll.sss, "sss"),
      employerSss: total(payroll.employerSss, "employer_sss"),
      philhealth: total(payroll.philhealth, "philhealth"),
      employerPhilhealth: total(payroll.employerPhilhealth, "employer_philhealth"),
      pagibig: total(payroll.pagibig, "pagibig"),
      employerPagibig: total(payroll.employerPagibig, "employer_pagibig"),
      employerEc: total(payroll.employerEc, "employer_ec"),
    })
    .from(payroll)
    .groupBy(payroll.batchId)
    .as("l");

  const rows = await db
    .select({
      id: payrollBatches.id,
      status: payrollBatches.status,
      projectCode: payrollBatches.projectCode,
      projectName: projects.name,
      group: payrollBatches.group,
      period: payrollBatches.period,
      employees: payrollBatches.employees,
      overtimeHours: payrollBatches.overtimeHours,
      gross: payrollBatches.grossPayroll,
      deductions: payrollBatches.deductions,
      net: payrollBatches.netPayroll,
      employerCost: payrollBatches.employerCost,
      createdAt: payrollBatches.createdAt,
      submittedAt: payrollBatches.submittedAt,
      reviewedAt: payrollBatches.reviewedAt,
      linePeriodEnd: lines.periodEnd,
      lineRegularHours: lines.regularHours,
      sss: lines.sss,
      employerSss: lines.employerSss,
      philhealth: lines.philhealth,
      employerPhilhealth: lines.employerPhilhealth,
      pagibig: lines.pagibig,
      employerPagibig: lines.employerPagibig,
      employerEc: lines.employerEc,
    })
    .from(payrollBatches)
    .leftJoin(lines, eq(lines.batchId, payrollBatches.id))
    .leftJoin(projects, eq(projects.code, payrollBatches.projectCode));

  // Line sums come back as numeric strings (or null for a batch without lines).
  const n = (v: unknown) => Number(v ?? 0);
  return rows.map((r) => ({
    ...r,
    linePeriodEnd: r.linePeriodEnd ?? null,
    lineRegularHours: n(r.lineRegularHours),
    sss: n(r.sss),
    employerSss: n(r.employerSss),
    philhealth: n(r.philhealth),
    employerPhilhealth: n(r.employerPhilhealth),
    pagibig: n(r.pagibig),
    employerPagibig: n(r.employerPagibig),
    employerEc: n(r.employerEc),
  }));
};
