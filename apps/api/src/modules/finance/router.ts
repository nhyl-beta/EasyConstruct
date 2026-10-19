// apps/api/src/routes/finance.ts
import { Router } from "express";
import { summaryRouter } from "./summary/routes.js";
import { budgetAdjustmentsRoutes } from "./budget-adjustments/routes.js";
import { budgetApprovalStepsRoutes } from "./budget-approval-steps/routes.js";
import { budgetsRoutes } from "./budget/routes.js";
import { cashFlowRouter } from "./cash-flow/routes.js";
import { expensesRouter } from "./expenses/routes.js";
import { projectProfitabilityRouter } from "./project-profitability/routes.js";
import { approvalsRouter } from "./approvals/routes.js";

import { categoriesRouter } from "./categories/routes.js";
import { procurementRouter } from "./procurement/routes.js";
import { purchaseRequestsRouter } from "./purchase-requests/routes.js";
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
financeRouter.use("/procurement", procurementRouter);
financeRouter.use("/categories", categoriesRouter);
//financeRouter.use("/ai-insights", aiInsightsRouter);
//financeRouter.use("/risks", risksRouter);
//financeRouter.use("/reports", reportsRouter);
