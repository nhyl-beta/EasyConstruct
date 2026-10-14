// server/src/finance/purchasing/booking.ts
//
// The ONE place money moves on a budget line and on the cash flow. Expense
// approval and order payment both call these, so the booking
// logic exists once:
//   * applyApprovedSpend  — budgets.actual += amount, then that month's cash
//     flow outflow is recomputed;
//   * adjustCommitted     — budgets.committed += delta (atomic SQL, floored at 0).
// Budget line matching is `project + category` string equality, newest line first.
import { and, desc, eq, sql } from "drizzle-orm";
import { budgets } from "../../db/schema/finance.js";
import type { db } from "../../db/connection.js";
import { monthKey } from "../cash-flow/months.js";
import { refreshMonth, type WriteExecutor } from "../cash-flow/service.js";
import type { BudgetLine } from "./rules.js";

export type Tx = Pick<typeof db, "select" | "update"> & WriteExecutor;
type Reader = Pick<typeof db, "select">;

/** The budget line a project + category spends against, or null when there is none. */
export async function findBudgetLine(
  exec: Reader,
  project: string,
  category: string,
): Promise<(BudgetLine & { id: number }) | null> {
  const [row] = await exec
    .select({ id: budgets.id, planned: budgets.planned, committed: budgets.committed, actual: budgets.actual })
    .from(budgets)
    .where(and(eq(budgets.project, project), eq(budgets.category, category)))
    .orderBy(desc(budgets.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Books approved spend: `actual = actual + amount` on the matching line and a
 * cash-flow refresh for the month of `at`. Returns whether a budget line matched
 * (the spend is still recorded when none does).
 */
export async function applyApprovedSpend(
  tx: Tx,
  spend: { project: string; category: string; amount: number; at: Date },
): Promise<{ matched: boolean }> {
  const line = await findBudgetLine(tx, spend.project, spend.category);
  if (line) {
    await tx
      .update(budgets)
      .set({ actual: sql`${budgets.actual} + ${spend.amount}`, updatedAt: new Date() })
      .where(eq(budgets.id, line.id));
  }
  await refreshMonth(monthKey(spend.at), tx);
  return { matched: line != null };
}

/**
 * `committed = max(0, committed + delta)` in one statement (no read-modify-write),
 * so concurrent commits and releases cannot lose an update.
 */
export async function adjustCommitted(
  tx: Pick<typeof db, "select" | "update">,
  project: string,
  category: string,
  delta: number,
): Promise<{ matched: boolean }> {
  const line = await findBudgetLine(tx, project, category);
  if (!line || delta === 0) return { matched: line != null };
  await tx
    .update(budgets)
    .set({ committed: sql`GREATEST(0, ${budgets.committed} + ${delta})`, updatedAt: new Date() })
    .where(eq(budgets.id, line.id));
  return { matched: true };
}
