export type AdjustmentKind = "increase" | "decrease" | "transfer" | "emergency";

export interface BudgetAdjustment {
  id: number;
  budgetId: number;
  kind: AdjustmentKind;
  originalAmount: number;
  adjustmentAmount: number;
  newAmount: number;
  reason: string;
  requestedBy: string;
  requestedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  status: string;
}
