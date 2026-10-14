export interface Budget {
  id: number;
  project: string;
  planned: number;
  committed: number;
  actual: number;
  fiscalYear: string;
}

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
  /** Plain-language reasons behind a non-zero score (rule-based). */
  anomalyReason?: string | null;
  receiptUrl: string | null;
  /** Where the spend came from: a direct entry, a paid order (or, on old rows, a retired paid claim). */
  sourceType?: "manual" | "purchase-order" | "reimbursement";
  sourceId?: string | null;
}

// One row of the dashboard's "Pending approvals" card: something waiting on
// Finance's sign-off, read live from expenses, payroll batches and budgets by
// GET /finance/approvals. There is no SLA data in the system, so only how long
// it has been waiting is shown.
export interface Approval {
  /** Unique across sources: exp-<id>, pay-<id>, bud-<id>, pr-<id>. */
  id: string;
  kind: "Expense" | "Payroll" | "Budget" | "Purchase request";
  reference: string;
  requestedBy: string;
  amount: number;
  waitingHours: number;
  status: string;
  /** Finance page where the item is acted on. */
  href: string;
}

export interface ApprovalList {
  items: Approval[];
  /** Everything waiting, not just the rows returned. */
  total: number;
}

export interface AIInsight {
  id: string;
  category: string;
  title: string;
  body: string;
  impact: string;
  confidence: number; // 0-1
}

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface FinancialRisk {
  id: string;
  title: string;
  impact: string;
  project: string;
  level: RiskLevel;
}

export interface CashFlowPoint {
  month: string;
  inflow: number;
  outflow: number;
}

export interface ProjectProfitability {
  project: string;
  revenue: number;
  cost: number;
  margin: number; // 0-1
}

export interface ScheduledReport {
  id: number;
  title: string;
  cadence: string;
  time: string;
}

export interface FinanceKpis {
  totalBudget: number;
  utilizationPct: number;
  remainingBudget: number;
  monthlyExpenses: number;
  pendingPayrollReviews: number;
  outstandingInvoices: number; // TODO: 0 until an invoices table exists — see note in summary/repository.ts
  cashFlowNet: number;
  profitMargin: number;
}
