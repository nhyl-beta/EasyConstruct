// The managed expense-category list (server: /api/finance/categories).

/** Row counts per table that hold a category as text (only present with ?withUsage=true). */
export interface CategoryUsage {
  budgets: number;
  expenses: number;
  purchaseRequests: number;
  reimbursements: number;
  procurementOrders: number;
  budgetAllocations: number;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  isActive: boolean;
  /** Protected: cannot be retired or renamed (payroll books against "Labor"). */
  isSystem: boolean;
  sortOrder: number;
  usage?: CategoryUsage;
}

export interface CategoryResult {
  ok: boolean;
  error: string | null;
}
