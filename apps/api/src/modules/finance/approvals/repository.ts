// apps/api/src/finance/approvals/repository.ts
//
// Read-only: what is waiting on Finance, read from the tables where the work is
// actually done (expenses, payroll batches, budgets). Nothing is stored in
// approvals_queue, so this list can never disagree with those pages.
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { budgets, expenses, payrollBatches, purchaseRequests } from "../../../core/db/schema/finance.js";
import { payrollCost } from "../cash-flow/months.js";
import type { PendingItem } from "./merge.js";

export type Reader = Pick<typeof db, "select">;

export const approvalsRepository = {
  async pendingExpenses(exec: Reader = db): Promise<PendingItem[]> {
    const rows = await exec.select().from(expenses).where(eq(expenses.status, "pending"));
    return rows.map((e) => ({
      id: `exp-${e.id}`,
      kind: "Expense",
      reference: `${e.vendor} · ${e.project}`,
      // Expenses record no submitter; they are entered by Finance.
      requestedBy: "Finance",
      amount: e.amount,
      waitingSince: e.submittedAt,
      href: "/expenses",
    }));
  },

  async pendingPayroll(exec: Reader = db): Promise<PendingItem[]> {
    const rows = await exec.select().from(payrollBatches).where(eq(payrollBatches.status, "pending"));
    return rows.map((b) => ({
      id: `pay-${b.id}`,
      kind: "Payroll",
      reference: `${b.projectCode ?? "All projects"} · ${b.period}`,
      requestedBy: "HR",
      // Same amount the Labor budget booking uses.
      amount: payrollCost({ employerCost: b.employerCost, grossPayroll: b.grossPayroll }),
      waitingSince: b.submittedAt ?? b.createdAt,
      href: "/payroll-review",
    }));
  },

  /**
   * Budgets whose status is "finance-review" (the finance stage of
   * finance/budget-approval-steps). The budget has no "entered review at"
   * column, so `updated_at` (written when the status last changed) stands in.
   */
  async pendingBudgets(exec: Reader = db): Promise<PendingItem[]> {
    const rows = await exec.select().from(budgets).where(eq(budgets.status, "finance-review"));
    return rows.map((b) => ({
      id: `bud-${b.id}`,
      kind: "Budget",
      reference: `${b.project} · ${b.category}`,
      requestedBy: b.owner,
      amount: b.planned,
      waitingSince: b.updatedAt,
      href: "/budget",
    }));
  },

  /** Purchase requests that have reached Finance (endorsed, or raised by a PM / Admin). */
  async pendingPurchaseRequests(exec: Reader = db): Promise<PendingItem[]> {
    const rows = await exec.select().from(purchaseRequests).where(eq(purchaseRequests.status, "pending-finance"));
    return rows.map((r) => ({
      id: `pr-${r.id}`,
      kind: "Purchase request",
      reference: `${r.title} · ${r.project}`,
      requestedBy: r.requestedBy,
      amount: r.amount,
      waitingSince: r.endorsedAt ?? r.requestedAt,
      href: "/expenses?tab=purchase-requests",
    }));
  },
};
