// apps/web/src/features/finance/hooks/use-finance-dashboard.ts
import type {
  Approval,
  Budget,
  CashFlowPoint,
  Expense,
  FinanceKpis,
  ProjectProfitability,
} from "@/features/finance/types/finance.types";
import { useDashboardSummary, type FinanceSummary } from "@/features/dashboard/hooks/useDashboardSummary";

interface UseFinanceDashboardResult {
  budgets: Budget[];
  expenses: Expense[];
  approvals: Approval[];
  /** Everything waiting on Finance, for the card badge (the list itself is capped). */
  approvalsTotal: number;
  /** Set when GET /finance/approvals failed, so the card does not pass it off as empty. */
  approvalsError: string | null;
  approvalsLoading: boolean;
  retryApprovals: () => void;
  cashFlow: CashFlowPoint[];
  projectProfit: ProjectProfitability[];
  kpis: FinanceKpis;
  isLoading: boolean;
  error: string | null;
}

const EMPTY_KPIS: FinanceKpis = {
  totalBudget: 0,
  utilizationPct: 0,
  remainingBudget: 0,
  monthlyExpenses: 0,
  pendingPayrollReviews: 0,
  outstandingInvoices: 0,
  cashFlowNet: 0,
  profitMargin: 0,
};

/**
 * The Finance dashboard in one request: GET /api/dashboard/summary returns the
 * KPIs, the budget lines (project + planned only), the newest expenses, the cash
 * flow, project profitability and the waiting-on-Finance list. A section the
 * server could not compute comes back null and the others still render (as the
 * old per-endpoint calls did).
 */
export function useFinanceDashboardController(): UseFinanceDashboardResult {
  const { summary, loading, error: requestError, reload } = useDashboardSummary<FinanceSummary>();

  const budgets = (summary?.budgets ?? []) as unknown as Budget[];
  const expenses = (summary?.expenses ?? []) as unknown as Expense[];
  const cashFlow = (summary?.cashFlow ?? []) as unknown as CashFlowPoint[];
  const projectProfit = (summary?.projectProfit ?? []) as unknown as ProjectProfitability[];
  const kpis = (summary?.kpis as FinanceKpis | null | undefined) ?? EMPTY_KPIS;
  const approvalList = summary?.approvals as { items: Approval[]; total: number } | null | undefined;

  // Only complain if nothing at all came back - a partial load is fine.
  const allFailed =
    !!summary &&
    summary.kpis === null &&
    summary.budgets === null &&
    summary.expenses === null &&
    summary.cashFlow === null &&
    summary.projectProfit === null;

  return {
    budgets,
    expenses,
    approvals: approvalList?.items ?? [],
    approvalsTotal: approvalList?.total ?? 0,
    approvalsError: requestError
      ? requestError.message
      : summary && summary.approvals === null
        ? "Could not load approvals"
        : null,
    approvalsLoading: loading,
    retryApprovals: () => void reload(),
    cashFlow,
    projectProfit,
    kpis,
    isLoading: loading,
    error: requestError
      ? requestError.message
      : allFailed
        ? "Finance data is unavailable."
        : null,
  };
}
