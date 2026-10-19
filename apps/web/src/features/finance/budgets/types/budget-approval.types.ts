export const APPROVAL_STAGES = [
  "draft",
  "pending-review",
  "finance-review",
  "manager-review",
  "approved",
] as const;

export type ApprovalStage = (typeof APPROVAL_STAGES)[number];
export type ApprovalDecision = "approved" | "rejected" | "returned";

export interface BudgetApprovalStep {
  id: number;
  budgetId: number;
  stage: string;
  decision: string | null;
  actor: string | null;
  comment: string | null;
  decidedAt: string | null;
}