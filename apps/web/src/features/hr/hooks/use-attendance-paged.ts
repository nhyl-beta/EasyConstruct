import { DEFAULT_PAGE_SIZE } from "@/config/pagination";
import { useCallback, useEffect, useState } from "react";

import {
  getAttendanceHeatmap,
  listAttendancePage,
  type AttendanceHeatmap,
  type AttendancePage,
} from "../attendance-api";
import { listEmployees } from "../hr-api";


export interface AttendanceFilterState {
  /** Verification status: all | Verified | Pending | Flagged. */
  verification: string;
  /** Working-day status: all | Present | Late | Absent | On Leave | Half Day. */
  status: string;
}

const NO_FILTERS: AttendanceFilterState = { verification: "all", status: "all" };

/**
 * HR attendance log: server-side search, filters and pagination. The page goes
 * back to 1 whenever the search or a filter changes; the KPI counts come from
 * the whole filtered set rather than the visible page.
 */
/** Narrows the log to one person and day, e.g. the clock-in an alert links to. */
export interface AttendanceScope {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useAttendancePaged(scope?: AttendanceScope) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<AttendanceFilterState>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const [data, setData] = useState<AttendancePage | null>(null);
  const [heatmap, setHeatmap] = useState<AttendanceHeatmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, { name: string; initials: string }>>(new Map());

  // Debounced search; a new search starts from page 1.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    listEmployees()
      .then((employees) => setNames(new Map(employees.map((e) => [e.id, { name: e.name, initials: e.initials }]))))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await listAttendancePage({ page, pageSize, search: scope?.search ?? search, dateFrom: scope?.dateFrom, dateTo: scope?.dateTo, ...filters }, names));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, filters, names, scope?.search, scope?.dateFrom, scope?.dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadHeatmap = useCallback(async () => {
    try {
      setHeatmap(await getAttendanceHeatmap());
    } catch {
      setHeatmap(null);
    }
  }, []);

  useEffect(() => {
    void loadHeatmap();
  }, [loadHeatmap]);

  const setFilter = (key: keyof AttendanceFilterState, value: string) => {
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
    summary: data?.summary ?? null,
    heatmap,
    query,
    setQuery,
    filters,
    setFilter,
    clearFilters,
    hasActiveFilters: query.trim() !== "" || Object.values(filters).some((v) => v !== "all"),
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    loading,
    error,
    /** Reloads the current page, its counts and the heatmap (after a verification). */
    reload: async () => {
      await Promise.all([load(), loadHeatmap()]);
    },
  } as const;
}
