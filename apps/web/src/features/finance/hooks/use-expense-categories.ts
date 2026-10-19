import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { CategoryRepository } from "../repositories/categories.repository";
import type { ExpenseCategory } from "../types/categories.types";

// One list shared by every component on the page (and across pages in a
// session): a tiny module-level store, fetched on first use. Nothing falls back
// to a built-in list when the request fails - the dropdowns show a retry instead.

interface State {
  categories: ExpenseCategory[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

let state: State = { categories: [], status: "idle", error: null };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

/** Fetches the list; concurrent callers share one request. Keeps showing the old list while refreshing. */
function load(): Promise<void> {
  if (inflight) return inflight;
  set({ status: state.status === "ready" ? "ready" : "loading", error: null });
  inflight = CategoryRepository.list()
    .then((categories) => set({ categories, status: "ready", error: null }))
    .catch((err: unknown) =>
      set({ status: state.categories.length ? "ready" : "error", error: err instanceof Error ? err.message : "Failed to load categories" }),
    )
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const getSnapshot = () => state;

export function useExpenseCategories() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (state.status === "idle") void load();
  }, []);

  const refresh = useCallback(() => load(), []);
  const activeCategories = useMemo(() => snap.categories.filter((c) => c.isActive), [snap.categories]);

  return {
    /** Every category, active and retired. */
    categories: snap.categories,
    /** Only active ones: what new entries may pick. */
    activeCategories,
    loading: snap.status === "idle" || snap.status === "loading",
    error: snap.status === "error" ? snap.error : null,
    refresh,
  };
}

