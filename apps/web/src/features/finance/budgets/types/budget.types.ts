export type BudgetStatus =
  | "draft"
  | "pending-review"
  | "finance-review"
  | "manager-review"
  | "approved"
  | "rejected"
  | "locked";

export interface Budget {
  id: number;
  project: string;
  category: string;
  owner: string;
  planned: number;
  committed: number;
  spent: number;
  fiscalYear: string;
  status: BudgetStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BudgetTotals {
  planned: number;
  committed: number;
  spent: number;
  remaining: number;
}