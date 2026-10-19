// apps/api/src/finance/cash-flow/sources.ts
//
// The single definition of "cash out". Everything that shows money leaving —
// the cash flow chart, "Monthly expenses", project profitability — reads these
// queries so the figures cannot drift apart:
//   * an APPROVED expense, in the month it was submitted (there is no
//     approved-on column on `expenses`);
//   * an APPROVED payroll batch (employer cost, gross for legacy batches), in
//     the month of the approving decision.
// Pending and rejected expenses, and budget changes, are not cash.
import { and, eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { expenses, payrollBatches } from "../../../core/db/schema/finance.js";
import { payrollBatchDecisions } from "../../../core/db/schema/payroll.js";
import { bucketByMonth, monthKey, payrollCost, round2 } from "./months.js";

export type Executor = Pick<typeof db, "select">;

/** Approved expenses as (month, amount) rows. */
const approvedExpenseRows = async (exec: Executor) =>
  (
    await exec
      .select({ project: expenses.project, amount: expenses.amount, at: expenses.submittedAt })
      .from(expenses)
      .where(eq(expenses.status, "approved"))
  ).map((r) => ({ project: r.project, amount: Number(r.amount), at: r.at }));

/** Approved payroll batches with the time the approving decision was made. */
const approvedPayrollRows = async (exec: Executor) =>
  (
    await exec
      .select({
        project: payrollBatches.projectCode,
        employerCost: payrollBatches.employerCost,
        grossPayroll: payrollBatches.grossPayroll,
        at: payrollBatchDecisions.decidedAt,
      })
      .from(payrollBatchDecisions)
      .innerJoin(payrollBatches, eq(payrollBatches.id, payrollBatchDecisions.batchId))
      .where(and(eq(payrollBatchDecisions.action, "approved"), eq(payrollBatches.status, "approved")))
  ).map((r) => ({
    project: r.project,
    amount: payrollCost({ employerCost: Number(r.employerCost), grossPayroll: Number(r.grossPayroll) }),
    at: r.at,
  }));

export const expenseOutflowByMonth = async (exec: Executor = db) => bucketByMonth(await approvedExpenseRows(exec));

export const payrollOutflowByMonth = async (exec: Executor = db) => bucketByMonth(await approvedPayrollRows(exec));

/** Approved expenses of the month `now` falls in. */
export const currentMonthExpenseOutflow = async (now: Date = new Date(), exec: Executor = db) =>
  (await expenseOutflowByMonth(exec)).get(monthKey(now)) ?? 0;

/** Approved expenses plus approved payroll cost, per project code. */
export const projectCosts = async (exec: Executor = db): Promise<Map<string, number>> => {
  const out = new Map<string, number>();
  for (const r of [...(await approvedExpenseRows(exec)), ...(await approvedPayrollRows(exec))]) {
    if (!r.project) continue;
    out.set(r.project, round2((out.get(r.project) ?? 0) + r.amount));
  }
  return out;
};
