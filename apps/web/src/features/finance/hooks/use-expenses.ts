import type { Expense } from "@/features/finance/types/finance.types";
import { apiClient } from "@/services/api.client";
import { useCallback, useEffect, useState } from "react";
import { useServerList } from "@/hooks/use-server-list";
import { qk } from "@/lib/query-keys";

export interface CreateExpenseInput {
  vendor: string;
  project: string;
  category: string;
  amount: number;
  receiptUrl?: string;
}

interface UseExpensesResult {
  /** The page of the ledger on screen. */
  expenses: Expense[];
  /** Page controls and totals for <DataTablePagination {...pagination} />. */
  pagination: ReturnType<typeof useServerList<Expense, ExpenseExtras>>;
  /** Every expense the current search / category selects (for the CSV export). */
  fetchAllMatching: () => Promise<Expense[]>;
  /** Expenses the anomaly rules flagged, across the whole selection. */
  anomalies: Expense[];
  breakdown: { category: string; amount: number }[];
  query: string;
  setQuery: (q: string) => void;
  category: string;
  setCategory: (c: string) => void;
  isLoading: boolean;
  error: string | null;
  creating: boolean;
  createError: string | null;
  createExpense: (input: CreateExpenseInput) => Promise<boolean>;
  /** Approved expenses of the current month, from /finance/summary (the cash flow definition). */
  monthlyApproved: number | null;
  /** Approve or reject a pending expense; refreshes the list and the summary. */
  decide: (id: string, decision: "approve" | "reject") => Promise<DecisionResult>;
}

interface ExpenseExtras {
  breakdown: { category: string; amount: number }[];
  anomalies: Expense[];
}

export interface DecisionResult {
  ok: boolean;
  /** Non-fatal note from the server, e.g. no budget line matched. */
  warning: string | null;
  error: string | null;
}

export function useExpensesController(): UseExpensesResult {
  const [category, setCategory] = useState("all");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [monthlyApproved, setMonthlyApproved] = useState<number | null>(null);
  const [summaryToken, setSummaryToken] = useState(0);

  const baseQuery = (extra: Record<string, string>) => {
    const params = new URLSearchParams(extra);
    if (category !== "all") params.set("category", category);
    return params;
  };

  // The ledger is paged by the server (search is debounced); the response also
  // carries the spend-by-category and flagged-expense figures for the
  // Analytics tab, computed over the whole selection rather than this page.
  const list = useServerList<Expense, ExpenseExtras>({
    key: (params) => qk.finance.expenses(params),
    fetchPage: async (params) => {
      const qs = baseQuery({ page: String(params.page), limit: String(params.limit), extras: "1" });
      if (params.search) qs.set("query", params.search);
      const json = (await apiClient.get(`/finance/expenses?${qs.toString()}`)) as {
        data: Expense[];
        meta: { total: number; pages: number; breakdown: ExpenseExtras["breakdown"]; anomalies: Expense[] };
      };
      return {
        items: json.data ?? [],
        total: json.meta.total,
        pages: json.meta.pages,
        extra: { breakdown: json.meta.breakdown ?? [], anomalies: json.meta.anomalies ?? [] },
      };
    },
    filters: { category },
  });

  const fetchAllMatching = useCallback(async () => {
    const all: Expense[] = [];
    for (let page = 1; ; page++) {
      const qs = baseQuery({ page: String(page), limit: "100" });
      if (list.search) qs.set("query", list.search);
      const json = (await apiClient.get(`/finance/expenses?${qs.toString()}`)) as {
        data: Expense[];
        meta: { pages: number };
      };
      all.push(...(json.data ?? []));
      if (page >= json.meta.pages || (json.data ?? []).length === 0) return all;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, list.search]);

  useEffect(() => {
    let active = true;
    apiClient
      .get("/finance/summary")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((json: any) => active && setMonthlyApproved(Number(json?.data?.monthlyExpenses ?? 0)))
      .catch(() => active && setMonthlyApproved(null));
    return () => {
      active = false;
    };
  }, [summaryToken]);

  const decide = useCallback(async (id: string, decision: "approve" | "reject"): Promise<DecisionResult> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any = await apiClient.patch(`/finance/expenses/${encodeURIComponent(id)}/${decision}`, {});
      setSummaryToken((t) => t + 1);
      return { ok: true, warning: json?.data?.warning ?? null, error: null };
    } catch (err) {
      // A 409 (already decided) means the list is stale; refresh it too.
      setSummaryToken((t) => t + 1);
      list.reload();
      return { ok: false, warning: null, error: err instanceof Error ? err.message : "Could not update the expense" };
    }
  }, []);

  const createExpense = useCallback(async (input: CreateExpenseInput) => {
    setCreating(true);
    setCreateError(null);
    try {
      await apiClient.post("/finance/expenses", input);
      setSummaryToken((t) => t + 1);
      return true;
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to record expense");
      return false;
    } finally {
      setCreating(false);
    }
  }, []);

  return {
    expenses: list.pageItems,
    pagination: list,
    fetchAllMatching,
    anomalies: list.extra?.anomalies ?? [],
    breakdown: list.extra?.breakdown ?? [],
    query: list.searchInput,
    setQuery: list.setSearchInput,
    category,
    setCategory,
    isLoading: list.loading,
    error: list.error ? list.error.message : null,
    creating,
    createError,
    createExpense,
    monthlyApproved,
    decide,
  };
}
