export type ExpenseStatus = "pending" | "approved" | "rejected";

export interface Expense {
  id: string;
  vendor: string;
  project: string;
  category: string;
  amount: number;
  submittedAt: string;
  status: ExpenseStatus;
  anomalyScore: number | null;
  anomalyReason: string | null;
  receiptUrl: string | null;
}

export interface CreateExpenseInput {
  vendor: string;
  project: string;
  category: string;
  amount: number;
  receiptUrl?: string;
}

export interface ListExpensesQuery {
  query?: string;
  category?: string;
  /** Restrict to these project codes (visibility scope; undefined = no restriction). */
  codes?: string[];
  page?: number;
  pageSize?: number;
}
