// apps/api/src/utils/paging.ts
//
// Page arithmetic for server-side paginated lists (attendance, revisions). Pure so the clamping rules are
// testable: a page past the end snaps to the last page, sizes are bounded.
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  offset: number;
}

export const resolvePage = (
  requested: { page?: number; pageSize?: number },
  total: number,
): PageMeta => {
  const pageSize = Math.min(
    Math.max(Math.trunc(requested.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(Math.max(Math.trunc(requested.page ?? 1) || 1, 1), pages);
  return { total, page, pageSize, pages, offset: (page - 1) * pageSize };
};
