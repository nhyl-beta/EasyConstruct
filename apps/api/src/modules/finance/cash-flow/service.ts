// apps/api/src/finance/cash-flow/service.ts
//
// Keeps one `cash_flow_entries` row per month in step with the approved
// expense and payroll records, and with recorded client payments. Both
// inflow and outflow are RECOMPUTED from the records (never incremented), so
// a retry or a double click cannot make either drift.
import { sql } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { cashFlowEntries } from "../../../core/db/schema/finance.js";
import { keyToLabel, round2 } from "./months.js";
import { expenseOutflowByMonth, payrollOutflowByMonth, paymentInflowByMonth, type Executor } from "./sources.js";

export type WriteExecutor = Executor & Pick<typeof db, "insert" | "execute">;

/**
 * Recomputes the inflow and outflow of the month `monthKey` ("2026-03") and
 * upserts its row. Call it inside the transaction that changed the records.
 * It first takes a per-month transaction lock: without it, two writes
 * committing in the same month each recompute without the other's
 * uncommitted row, and the later upsert overwrites the month with a total
 * that is missing one of them.
 */
export const refreshMonth = async (monthKey: string, exec: WriteExecutor = db) => {
  await exec.execute(sql`select pg_advisory_xact_lock(hashtext(${`cash_flow_entries:${monthKey}`}))`);
  const [expense, payroll, payment] = await Promise.all([
    expenseOutflowByMonth(exec),
    payrollOutflowByMonth(exec),
    paymentInflowByMonth(exec),
  ]);
  const outflow = round2((expense.get(monthKey) ?? 0) + (payroll.get(monthKey) ?? 0));
  const inflow = round2(payment.get(monthKey) ?? 0);
  await exec
    .insert(cashFlowEntries)
    .values({ month: keyToLabel(monthKey), inflow, outflow })
    .onConflictDoUpdate({ target: cashFlowEntries.month, set: { inflow, outflow } });
  return outflow;
};
