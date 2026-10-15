import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/services/api.client";
import type { Budget, BudgetTotals } from "../types/budget.types";
import { useAuth } from "@/auth/auth-context";
import { canReadBudgets } from "../../lib/budget-access";

export interface CreateBudgetInput {
  project: string;
  category: string;
  owner: string;
  planned: number;
  fiscalYear: string;
}

export const useBudgetsController = (initialQuery = "") => {
  const { user } = useAuth();
  // Budgets are finance data (server: 403 for other roles). Don't ask, so the dashboard doesn't log a 403.
  const allowed = canReadBudgets(user?.role);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const [fy, setFy] = useState("all");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!allowed) {
      setBudgets([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);

    const params = new URLSearchParams();
    if (debouncedQuery) params.set("search", debouncedQuery);
    if (fy !== "all") params.set("fiscalYear", fy);

    // Was raw fetch() with no Authorization header — /api/finance now
    // requires a token (see app.ts), so this 401'd on every load and the
    // budgets table always showed empty.
    apiClient
      .get(`/finance/budgets?${params.toString()}`, { signal: controller.signal })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((json: any) => setBudgets(json.data ?? []))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [debouncedQuery, fy, reloadToken, allowed]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  const createBudget = useCallback(
    async (input: CreateBudgetInput) => {
      setCreating(true);
      setError(null);
      try {
        await apiClient.post("/finance/budgets", input);
        reload();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create budget");
        return false;
      } finally {
        setCreating(false);
      }
    },
    [reload],
  );

  const totals: BudgetTotals = useMemo(() => {
    const planned = budgets.reduce((s, b) => s + b.planned, 0);
    const committed = budgets.reduce((s, b) => s + b.committed, 0);
    const spent = budgets.reduce((s, b) => s + b.spent, 0);
    return { planned, committed, spent, remaining: planned - spent };
  }, [budgets]);

  return { budgets, totals, loading, query, setQuery, fy, setFy, creating, error, createBudget, reload };
};