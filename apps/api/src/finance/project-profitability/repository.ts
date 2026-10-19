import { sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { budgets } from "../../db/schema/finance.js";
import { projectCosts } from "../cash-flow/sources.js";

/**
 * Derived, read-only rollup: treats a project's planned budget as "revenue"
 * and its cost as approved expenses plus approved payroll cost (the same
 * definition as the cash flow chart, finance/cash-flow/sources.ts). There is
 * no dedicated profitability table; this is computed on read. Planned budget is
 * a placeholder for revenue, not a precise accounting figure.
 */

export const projectProfitabilityRepository = {
  async compute() {
    const [rows, costs] = await Promise.all([
      db
        .select({
          project: budgets.project,
          revenue: sql<string>`sum(${budgets.planned})`,
        })
        .from(budgets)
        .groupBy(budgets.project),
      projectCosts(),
    ]);

    return rows.map((r) => {
      const revenue = Number(r.revenue);
      const cost = costs.get(r.project) ?? 0;
      const margin = revenue > 0 ? (revenue - cost) / revenue : 0;
      return { project: r.project, revenue, cost, margin };
    });
  },
};
