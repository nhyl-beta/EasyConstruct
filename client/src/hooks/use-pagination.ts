// client/src/hooks/use-pagination.ts
//
// Client-side pagination for the app's hand-rolled data tables.
//
// None of these tables go through Refine's real `useTable` (see
// components/refine-ui/data-table/data-table.tsx, which does and is fully
// built, including pagination — it just isn't wired into any page), so every
// list on the site renders its full array with no page boundary at all. This
// is the same shape without the Refine/tanstack-table dependency: hand it the
// full (already filtered/sorted) array, render `pageItems` instead, and drop
// <TablePagination {...pagination} /> below the table.
import { useEffect, useMemo, useState } from "react";

export interface Pagination<T> {
  /** The slice of `items` belonging to the current page — render this. */
  pageItems: T[];
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  pageCount: number;
  /** Total item count across all pages, before slicing. */
  total: number;
}

/**
 * `resetKey`: pass anything that identifies the current search, filter or tab
 * (a string, or a joined key); the list goes back to page 1 whenever it changes.
 */
export function usePagination<T>(
  items: T[],
  initialPageSize = 10,
  resetKey?: string | number | null,
): Pagination<T> {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  // Adjusting state while rendering (the documented pattern) so a changed
  // filter never shows a frame of the old page number.
  const [lastKey, setLastKey] = useState(resetKey);
  if (lastKey !== resetKey) {
    setLastKey(resetKey);
    setCurrentPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // A filter or a delete can shrink `items` out from under the page the user
  // is currently sitting on (e.g. viewing page 3 of 3, then a search narrows
  // it to one page) — clamp back rather than render an empty page with
  // working "previous" and dead "next" buttons.
  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  // Changing the page size part-way through changes what "page 4" even
  // means, so it resets to page 1 rather than leaving the user on a
  // now-arbitrary offset into the list.
  const setPageSize = (size: number) => {
    setPageSizeState(size);
    setCurrentPage(1);
  };

  return {
    pageItems,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    pageCount,
    total: items.length,
  };
}
