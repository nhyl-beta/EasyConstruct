import React from "react";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";

/** Rows-per-page, page indicator and previous/next for the projects table. */
export const ProjectsPagination: React.FC<{
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}> = ({ page, pages, pageSize, total, onPage, onPageSize }) => (
  <DataTablePagination
    currentPage={page}
    pageCount={pages}
    setCurrentPage={onPage}
    pageSize={pageSize}
    setPageSize={onPageSize}
    total={total}
  />
);
