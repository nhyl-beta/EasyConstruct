import { useCallback, useEffect, useState } from "react";
import { RevisionRepository } from "../repositories/revision.repository";
import type { RevisionFilters, RevisionPage, RevisionSummary } from "../types/revision.types";

export const REVISION_PAGE_SIZES = [10, 20, 50] as const;

export interface RevisionFilterState {
  project: string;
  itemType: string;
  status: string;
  dateFrom: string;
  dateTo: string;
}

const NO_FILTERS: RevisionFilterState = { project: "all", itemType: "all", status: "all", dateFrom: "", dateTo: "" };

/**
 * The Revisions list: server-side search, filters and pagination (same shape
 * as useProjectsPaged). The page returns to 1 whenever the search or a filter
 * changes, and the headline counts come from the whole scoped set.
 */
export function useRevisions() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<RevisionFilterState>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(REVISION_PAGE_SIZES[0]);

  const [data, setData] = useState<RevisionPage | null>(null);
  const [summary, setSummary] = useState<RevisionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await RevisionRepository.list(
          {
            search: search || undefined,
            project: filters.project !== "all" ? filters.project : undefined,
            itemType: filters.itemType !== "all" ? (filters.itemType as RevisionFilters["itemType"]) : undefined,
            status: filters.status !== "all" ? (filters.status as RevisionFilters["status"]) : undefined,
            dateFrom: filters.dateFrom || undefined,
            dateTo: filters.dateTo || undefined,
          },
          { page, pageSize },
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load revisions");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filters]);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await RevisionRepository.summary());
    } catch {
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const setFilter = (key: keyof RevisionFilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };
  const clearFilters = () => {
    setFilters(NO_FILTERS);
    setQuery("");
    setSearch("");
    setPage(1);
  };

  return {
    rows: data?.items ?? [],
    total: data?.total ?? 0,
    pages: data?.pages ?? 1,
    page: data?.page ?? page,
    pageSize,
    summary,
    query,
    setQuery,
    filters,
    setFilter,
    clearFilters,
    hasActiveFilters: query.trim() !== "" || Object.values(filters).some((v) => v !== "all" && v !== ""),
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    loading,
    error,
    reload: async () => {
      await Promise.all([load(), loadSummary()]);
    },
  } as const;
}
