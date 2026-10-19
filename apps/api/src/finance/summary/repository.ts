import { sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import {
  budgets,
  payrollBatches,
} from "../../db/schema/finance.js";
import { cashFlowRepository } from "../cash-flow/repository.js";
import { currentMonthExpenseOutflow } from "../cash-flow/sources.js";
import { projectProfitabilityRepository } from "../project-profitability/repository.js";

export const summaryRepository = {
  async compute() {
    const [
      budgetTotals = {
        totalPlanned: "0",
        totalActual: "0",
      },
    ] = await db
      .select({
        totalPlanned: sql<string>`coalesce(sum(${budgets.planned}), 0)`,
        totalActual: sql<string>`coalesce(sum(${budgets.actual}), 0)`,
      })
      .from(budgets);

    // Approved expenses of the current month — the same definition the cash
    // flow chart uses for expense outflow (finance/cash-flow/sources.ts).
    const monthlyExpenses = await currentMonthExpenseOutflow();

    // Payroll batches Finance has yet to decide.
    const [pendingPayroll = { count: "0" }] = await db
      .select({ count: sql<string>`count(*)` })
      .from(payrollBatches)
      .where(sql`${payrollBatches.status} = 'pending'`);

    // Newest calendar month, so this card and the chart's last bar agree.
    const [latestCashFlow] = (await cashFlowRepository.findRecent(1)).slice(-1);

    const profitability = await projectProfitabilityRepository.compute();

    const avgMargin =
      profitability.length > 0
        ? profitability.reduce((sum, project) => sum + project.margin, 0) /
          profitability.length
        : 0;

    const totalPlanned = Number(budgetTotals.totalPlanned);
    const totalActual = Number(budgetTotals.totalActual);

    return {
      totalBudget: totalPlanned,

      utilizationPct: totalPlanned > 0 ? totalActual / totalPlanned : 0,

      remainingBudget: totalPlanned - totalActual,

      monthlyExpenses,

      pendingPayrollReviews: Number(pendingPayroll.count),

      outstandingInvoices: 0,

      cashFlowNet: latestCashFlow
        ? Number(latestCashFlow.inflow) - Number(latestCashFlow.outflow)
        : 0,

      profitMargin: avgMargin,
    };
  },
};
