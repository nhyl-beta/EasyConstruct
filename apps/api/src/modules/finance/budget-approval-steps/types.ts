export const APPROVAL_STAGES = [
  "draft",
  "pending-review",
  "finance-review",
  "manager-review",
  "approved",
] as const;

export type ApprovalStage = (typeof APPROVAL_STAGES)[number];
export type ApprovalDecision = "approved" | "rejected" | "returned";

export interface BudgetApprovalStepRecord {
  id: number;
  budgetId: number;
  stage: string;
  decision: string | null;
  actor: string | null;
  comment: string | null;
  decidedAt: Date | null;
}

export interface DecideBudgetApprovalInput {
  budgetId: number;
  stage: ApprovalStage;
  decision: ApprovalDecision;
  actor: string;
  comment?: string;
}

export interface BudgetApprovalFilters {
  budgetId?: number;
}