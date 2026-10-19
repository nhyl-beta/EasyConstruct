import { useBudgetApprovalController } from "../controllers/budget-approval.controller";
import type { Budget } from "../types/budget.types";

export const useBudgetApproval = (budgets: Budget[], onDecided?: () => void) =>
  useBudgetApprovalController(budgets, onDecided);