// apps/api/src/utils/pagination.ts
//
// The one shared helper for list endpoints: parse page / limit / sort / order
// from the query string, run the count + the page, and answer
//   { success, message, data, meta: { page, limit, total, pageSize, pages } }
//
// `meta.pageSize` and `meta.pages` are kept beside `meta.limit` so the lists
// that were already paginated (projects, attendance, revisions) keep their
// existing response shape; everything is additive.
//
// Paging is requested by sending `page` or `limit` (aliases `pageSize`,
// `perPage`). A caller that sends neither keeps receiving the whole list
// unless the endpoint was switched to `enforce: true` once its consumers
// were migrated (phase 5). Sort fields are checked against a per-resource
// whitelist; anything else is a 400, never interpolated into SQL.
import { asc, desc, type AnyColumn, type SQL } from "drizzle-orm";
import type { Response } from "express";
import { ValidationError } from "./errors.js";
import { formatSuccess } from "./response.js";

// This module used to hold (only) a copy of these two helpers; keep them importable from here.
export { formatError, formatSuccess } from "./response.js";

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface PageRequest {
  /** True when the caller asked for paging (or the endpoint enforces it). */
  requested: boolean;
  page: number;
  limit: number;
  sort?: string;
  order: "asc" | "desc";
}

export interface PageOptions {
  /** Allowed `sort` values for this resource. */
  sortable?: readonly string[];
  /** Page even when the caller sent no page/limit (use once all consumers are migrated). */
  enforce?: boolean;
  defaultLimit?: number;
  defaultOrder?: "asc" | "desc";
}

export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  /** Same as `limit`, kept for the lists that predate this helper. */
  pageSize: number;
  pages: number;
  /** Additive, endpoint-specific extras (headline counts, breakdowns…). */
  [extra: string]: unknown;
}

type Query = Record<string, unknown>;

const first = (value: unknown): string | undefined => {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" || typeof v === "number" ? String(v) : undefined;
};

const positiveInt = (value: unknown): number | undefined => {
  const raw = first(value);
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : undefined;
};

export const parsePageRequest = (query: Query, opts: PageOptions = {}): PageRequest => {
  const limitParam = query.limit ?? query.pageSize ?? query.perPage;
  const requested =
    !!opts.enforce || query.page !== undefined || limitParam !== undefined;

  const defaultLimit = Math.min(opts.defaultLimit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const limit = Math.min(positiveInt(limitParam) ?? defaultLimit, MAX_LIMIT);
  const page = positiveInt(query.page) ?? 1;

  const order: "asc" | "desc" =
    first(query.order)?.toLowerCase() === "asc"
      ? "asc"
      : first(query.order)?.toLowerCase() === "desc"
        ? "desc"
        : (opts.defaultOrder ?? "desc");

  let sort: string | undefined;
  const requestedSort = first(query.sort);
  if (requested && requestedSort) {
    if (!opts.sortable?.includes(requestedSort)) {
      throw new ValidationError(
        `Cannot sort by "${requestedSort}"${opts.sortable?.length ? `; allowed: ${opts.sortable.join(", ")}` : ""}`,
      );
    }
    sort = requestedSort;
  }

  return { requested, page, limit, sort, order };
};

/** Page arithmetic: a page past the end snaps to the last page; an empty list is one empty page. */
export const resolveMeta = (req: Pick<PageRequest, "page" | "limit">, total: number) => {
  const pages = Math.max(Math.ceil(total / req.limit), 1);
  const page = Math.min(Math.max(req.page, 1), pages);
  const meta: PageMeta = { total, page, limit: req.limit, pageSize: req.limit, pages };
  return { meta, offset: (page - 1) * req.limit };
};

/** Runs the count, then the page for the clamped offset. */
export const paginate = async <T>(
  req: PageRequest,
  count: () => Promise<number>,
  fetchPage: (window: { limit: number; offset: number }) => Promise<T[]>,
): Promise<{ items: T[]; meta: PageMeta }> => {
  const total = await count();
  const { meta, offset } = resolveMeta(req, total);
  if (total === 0) return { items: [], meta };
  return { items: await fetchPage({ limit: meta.limit, offset }), meta };
};

/** ORDER BY for the requested sort (whitelisted column), else the resource's default ordering. */
export const orderByFor = (
  req: Pick<PageRequest, "sort" | "order">,
  columns: Record<string, AnyColumn>,
  fallback: SQL[],
  tiebreak?: AnyColumn,
): SQL[] => {
  const column = req.sort ? columns[req.sort] : undefined;
  if (!column) return fallback;
  const dir = req.order === "asc" ? asc : desc;
  return tiebreak ? [dir(column), dir(tiebreak)] : [dir(column)];
};

export const sendPaged = <T>(res: Response, items: T[], message: string, meta: PageMeta) =>
  res.json({ ...formatSuccess(items, message), meta });

/**
 * Pages rows that were already fetched and scoped in memory (small or
 * design-scoped lists where the visibility rule cannot be expressed in the
 * query). Same envelope as the SQL path; the response is bounded even though
 * the read is not.
 */
export const paginateRows = <T>(
  rows: T[],
  req: PageRequest,
  sorters: Record<string, (a: T, b: T) => number> = {},
): { items: T[]; meta: PageMeta } => {
  const sorter = req.sort ? sorters[req.sort] : undefined;
  const ordered = sorter ? [...rows].sort((a, b) => (req.order === "asc" ? sorter(a, b) : sorter(b, a))) : rows;
  const { meta, offset } = resolveMeta(req, ordered.length);
  return { items: ordered.slice(offset, offset + meta.limit), meta };
};

/** Compare helpers for `paginateRows` sorters. */
export const byString = <T>(get: (row: T) => string | null | undefined) => (a: T, b: T) =>
  (get(a) ?? "").localeCompare(get(b) ?? "");
export const byNumber = <T>(get: (row: T) => number | null | undefined) => (a: T, b: T) =>
  (get(a) ?? 0) - (get(b) ?? 0);
export const byDate = <T>(get: (row: T) => Date | string | null | undefined) => (a: T, b: T) =>
  (get(a) ? new Date(get(a)!).getTime() : 0) - (get(b) ? new Date(get(b)!).getTime() : 0);

/**
 * Answer a list endpoint whose rows are already fetched and scoped in memory:
 * paged envelope (with a whitelisted sort) when the caller asked for paging,
 * the plain array otherwise. For small lists and lists whose visibility rule
 * cannot be written into the query.
 */
export const respondList = <T>(
  res: Response,
  query: Query,
  rows: T[],
  message: string,
  sorters: Record<string, (a: T, b: T) => number> = {},
  opts: Omit<PageOptions, "sortable"> = {},
) => {
  const request = parsePageRequest(query, { ...opts, sortable: Object.keys(sorters) });
  if (!request.requested) return res.json(formatSuccess(rows, message));
  const { items, meta } = paginateRows(rows, request, sorters);
  return sendPaged(res, items, message, meta);
};

/** Validates the paging query up front (400 on a bad sort) before any work is done. */
export const assertPageQuery = (query: Query, sortable: readonly string[]) => {
  parsePageRequest(query, { sortable });
};
