// apps/web/src/hooks/use-server-list.ts
//
// Server-side pagination for a table: page, page size, a debounced search and
// the filters live here; the rows come from the server's `page` / `limit` /
// `search` parameters and `meta.total`. The previous page stays on screen while
// the next one loads. The returned fields match `usePagination` (pageItems,
// currentPage, setCurrentPage, pageSize, setPageSize, pageCount, total), so the
// same <DataTablePagination {...list} /> renders it.
import { keepPreviousData, useQuery, type QueryKey } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { STALE } from "@/lib/query-client";
import { useDebouncedValue } from "./use-debounced-value";

export interface ServerPage<T, X = undefined> {
  items: T[];
  total: number;
  pages?: number;
  /** Anything else the response carried that the screen needs (headline counts…). */
  extra?: X;
}

export interface ServerListParams {
  page: number;
  limit: number;
  search: string;
  [filter: string]: unknown;
}

export interface UseServerListOptions<T, X = undefined> {
  key: (params: ServerListParams) => QueryKey;
  fetchPage: (params: ServerListParams, signal?: AbortSignal) => Promise<ServerPage<T, X>>;
  /** Extra server-side filters (status, department…). Changing one returns to page 1. */
  filters?: Record<string, unknown>;
  initialPageSize?: number;
  staleTime?: number;
  enabled?: boolean;
}

export function useServerList<T, X = undefined>({
  key,
  fetchPage,
  filters = {},
  initialPageSize = 10,
  staleTime = STALE.list,
  enabled = true,
}: UseServerListOptions<T, X>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput.trim(), 300);

  // Anything that changes what is being looked at goes back to the first page.
  const filterSignature = JSON.stringify(filters);
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterSignature]);

  const params = useMemo<ServerListParams>(
    () => ({ ...filters, page: currentPage, limit: pageSize, search }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterSignature, currentPage, pageSize, search],
  );

  const query = useQuery({
    queryKey: key(params),
    queryFn: ({ signal }) => fetchPage(params, signal),
    placeholderData: keepPreviousData,
    staleTime,
    enabled,
  });

  const total = query.data?.total ?? 0;
  const pageCount = Math.max(1, query.data?.pages ?? Math.ceil(total / pageSize));

  // A delete can leave the user past the last page.
  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setCurrentPage(1);
  }, []);

  const { refetch } = query;
  const reload = useCallback(() => refetch(), [refetch]);

  return {
    pageItems: query.data?.items ?? [],
    /** The page's `extra` payload (see ServerPage). */
    extra: query.data?.extra,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    pageCount,
    total,
    /** The text in the box right now (updates on every keystroke). */
    searchInput,
    setSearchInput,
    /** The text the current results were searched with (debounced 300 ms). */
    search,
    /** True until the first page has arrived. */
    loading: query.isPending,
    /** True whenever a request is in flight (also while the previous page is shown). */
    fetching: query.isFetching,
    error: query.error as Error | null,
    reload,
  };
}
