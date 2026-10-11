// server/src/routes/finance.ts
import { Router } from "express";
import { summaryRouter } from "../finance/summary/routes.js";
import { budgetAdjustmentsRoutes } from "../finance/budget-adjustments/routes.js";
import { budgetApprovalStepsRoutes } from "../finance/budget-approval-steps/routes.js";
import { budgetsRoutes } from "../finance/budget/routes.js";
import { cashFlowRouter } from "../finance/cash-flow/routes.js";
import { expensesRouter } from "../finance/expenses/routes.js";
import { projectProfitabilityRouter } from "../finance/project-profitability/routes.js";
import { approvalsRouter } from "../finance/approvals/routes.js";

import { categoriesRouter } from "../finance/categories/routes.js";
import { procurementRouter } from "../finance/procurement/routes.js";
import { purchaseRequestsRouter } from "../finance/purchase-requests/routes.js";
import { reimbursementsRouter } from "../finance/reimbursements/routes.js";
//import { reportsRouter } from "../finance/reports/routes.js";
//import { risksRouter } from "../finance/risks/routes.js";
//import { aiInsightsRouter } from "../finance/ai-insights/routes.js";

export const financeRouter = Router();

financeRouter.use("/budgets", budgetsRoutes);
financeRouter.use("/budget-adjustments", budgetAdjustmentsRoutes);
financeRouter.use("/expenses", expensesRouter);
financeRouter.use("/cash-flow", cashFlowRouter);
financeRouter.use("/project-profitability", projectProfitabilityRouter);
financeRouter.use("/summary", summaryRouter);
financeRouter.use("/budget-approval-steps", budgetApprovalStepsRoutes);
financeRouter.use("/approvals", approvalsRouter);
financeRouter.use("/purchase-requests", purchaseRequestsRouter);
financeRouter.use("/reimbursements", reimbursementsRouter);
financeRouter.use("/procurement", procurementRouter);
financeRouter.use("/categories", categoriesRouter);
//financeRouter.use("/ai-insights", aiInsightsRouter);
//financeRouter.use("/risks", risksRouter);
//financeRouter.use("/reports", reportsRouter);
