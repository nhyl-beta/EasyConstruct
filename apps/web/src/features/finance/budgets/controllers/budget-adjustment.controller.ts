import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/services/api.client";
import type { AdjustmentKind, BudgetAdjustment } from "../types/budget-adjustment.types";

export const useBudgetAdjustmentController = () => {
  const [items, setItems] = useState<BudgetAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);
  const [kind, setKind] = useState<AdjustmentKind | "all">("all");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    const params = new URLSearchParams();
    if (debouncedQuery) params.set("search", debouncedQuery);
    if (kind !== "all") params.set("kind", kind);
    if (status !== "all") params.set("status", status);

    // Was raw fetch() with no Authorization header — /api/finance now
    // requires a token (see app.ts), so this always 401'd.
    apiClient
      .get(`/finance/budget-adjustments?${params.toString()}`, { signal: controller.signal })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((json: any) => setItems(json.data ?? []))
      .catch((err) => {
        if (err.name !== "AbortError") console.error(err);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [debouncedQuery, kind, status]);

  const totals = useMemo(() => {
    const count = items.length;
    const pending = items.filter((a) => a.status !== "approved" && a.status !== "rejected").length;
    const increases = items.filter((a) => a.adjustmentAmount > 0).reduce((s, a) => s + a.adjustmentAmount, 0);
    const decreases = items.filter((a) => a.adjustmentAmount < 0).reduce((s, a) => s + a.adjustmentAmount, 0);
    return { count, pending, increases, decreases };
  }, [items]);

  return { items, loading, query, setQuery, kind, setKind, status, setStatus, totals };
};