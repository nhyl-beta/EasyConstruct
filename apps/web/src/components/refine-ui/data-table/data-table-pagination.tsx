"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS } from "@/config/pagination";
import { cn } from "@/lib/utils";

type DataTablePaginationProps = {
  currentPage: number;
  pageCount: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  total?: number;
  /**
   * For half-width columns: icon-only previous/next, a smaller page-size
   * selector, no first/last buttons, and wrapping rows instead of one wide one.
   */
  compact?: boolean;
  /** Page sizes offered; defaults to 10, 20, 30, 40, 50. */
  pageSizeOptions?: readonly number[];
};

export function DataTablePagination({
  currentPage,
  pageCount,
  setCurrentPage,
  pageSize,
  setPageSize,
  total,
  compact = false,
  pageSizeOptions: pageSizeOptionsProp,
}: DataTablePaginationProps) {
  const pageSizeOptions = useMemo(() => {
    const baseOptions = pageSizeOptionsProp ?? PAGE_SIZE_OPTIONS;
    const optionsSet = new Set(baseOptions);

    if (!optionsSet.has(pageSize)) {
      optionsSet.add(pageSize);
    }

    return Array.from(optionsSet).sort((a, b) => a - b);
  }, [pageSize, pageSizeOptionsProp]);

  if (compact) {
    return (
      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 px-1 text-xs">
        <span className="whitespace-nowrap text-muted-foreground">
          {typeof total === "number" ? `${total} row(s)` : null}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex items-center gap-1.5 text-muted-foreground">
            <span className="sr-only sm:not-sr-only">Per page</span>
            <Select value={`${pageSize}`} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger aria-label="Rows per page" className="h-7 w-[76px] px-2 text-xs">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <span className="whitespace-nowrap font-medium tabular-nums">
            {currentPage} / {pageCount}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              className="h-7 w-7 p-0"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Go to previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              className="h-7 w-7 p-0"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === pageCount}
              aria-label="Go to next page"
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex",
        "items-center",
        "justify-between",
        "flex-wrap",
        "px-2",
        "w-full",
        "gap-2"
      )}
    >
      <div
        className={cn(
          "flex-1",
          "text-sm",
          "text-muted-foreground",
          "whitespace-nowrap"
        )}
      >
        {typeof total === "number" ? `${total} row(s)` : null}
      </div>
      <div className={cn("flex", "items-center", "flex-wrap", "gap-2")}>
        <div className={cn("flex", "items-center", "gap-2")}>
          <span className={cn("text-sm", "font-medium")}>Rows per page</span>
          <Select
            value={`${pageSize}`}
            onValueChange={(v) => setPageSize(Number(v))}
          >
            <SelectTrigger aria-label="Rows per page" className={cn("h-8", "w-[84px]")}>
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={cn("flex", "items-center", "flex-wrap", "gap-2")}>
          <div
            className={cn(
              "flex",
              "items-center",
              "justify-center",
              "text-sm",
              "font-medium"
            )}
          >
            Page {currentPage} of {pageCount}
          </div>
          <div className={cn("flex", "items-center", "gap-2")}>
            <Button
              variant="outline"
              className={cn("hidden", "h-8", "w-8", "p-0", "lg:flex")}
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              aria-label="Go to first page"
            >
              <ChevronsLeft />
            </Button>
            <Button
              variant="outline"
              className={cn("h-8", "w-8", "p-0")}
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Go to previous page"
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              className={cn("h-8", "w-8", "p-0")}
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === pageCount}
              aria-label="Go to next page"
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              className={cn("hidden", "h-8", "w-8", "p-0", "lg:flex")}
              onClick={() => setCurrentPage(pageCount)}
              disabled={currentPage === pageCount}
              aria-label="Go to last page"
            >
              <ChevronsRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

DataTablePagination.displayName = "DataTablePagination";
