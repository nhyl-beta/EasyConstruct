import type { ApiModule } from "../types.js";
import { authenticate, requireRole } from "../../core/auth/middleware.js";
import payrollReviewRoutes from "./payroll-review/routes.js";
import { financeRouter } from "./router.js";

export const module: ApiModule = {
  name: "finance",
  flag: "MODULE_FINANCE",
  mounts: [
    {
      order: 20,
      prefix: "/api/finance/payroll-review",
      middleware: [authenticate, requireRole("finance-manager", "finance_manager", "admin", "it-designer")],
      router: payrollReviewRoutes,
    },
    {
      order: 21,
      prefix: "/api/finance",
      middleware: [authenticate],
      router: financeRouter,
    },
  ],
  ownsTables: [
    "budgets", "budget_allocations", "budget_adjustments", "budget_approval_steps",
    "budget_history", "budget_comments", "budget_documents", "expenses",
    "expense_categories", "purchase_requests", "procurement_orders", "reimbursements",
    "approvals_queue", "cash_flow_entries", "financial_risks", "scheduled_reports",
  ],
};
