export type BudgetAdjustmentStatus =
  | "draft"
  | "pending-review"
  | "finance-review"
  | "manager-review"
  | "approved"
  | "rejected"
  | "locked";

export interface BudgetAdjustmentRecord {
  id: number;
  budgetId: number;
  kind: "increase" | "decrease" | "transfer" | "emergency";
  originalAmount: number;
  adjustmentAmount: number;
  newAmount: number;
  reason: string;
  requestedBy: string;
  requestedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  status: BudgetAdjustmentStatus;
}

export interface CreateBudgetAdjustmentInput {
  budgetId: number;
  kind: "increase" | "decrease" | "transfer" | "emergency";
  originalAmount: number;
  adjustmentAmount: number;
  newAmount: number;
  reason: string;
  requestedBy: string;
  status?: BudgetAdjustmentStatus;
}

export interface UpdateBudgetAdjustmentInput extends Partial<CreateBudgetAdjustmentInput> {
  approvedBy?: string;
  approvedAt?: Date;
}

export interface BudgetAdjustmentFilters {
  budgetId?: number;
  kind?: string;
  status?: string;
  search?: string;
}
