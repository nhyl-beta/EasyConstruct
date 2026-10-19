// Generic COUNT / one-page SELECT for a single table, so a repository only has
// to supply its WHERE clause and ORDER BY (see utils/pagination.ts).
import { inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "./connection.js";

export const countRows = async (table: PgTable, where: SQL | undefined): Promise<number> => {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(where);
  return row?.n ?? 0;
};

export const selectPage = async <T extends PgTable>(
  table: T,
  where: SQL | undefined,
  orderBy: SQL[],
  window: { limit: number; offset: number },
): Promise<T["$inferSelect"][]> =>
  (await db
    .select()
    .from(table as PgTable)
    .where(where)
    .orderBy(...orderBy)
    .limit(window.limit)
    .offset(window.offset)) as T["$inferSelect"][];

/** `col IN (codes)`, with an empty list meaning "nothing" instead of invalid SQL. */
export const inCodes = (column: AnyColumn, codes: readonly string[]): SQL =>
  codes.length ? inArray(column, [...codes]) : sql`false`;

/** `SELECT col, count(*) ... GROUP BY col` over a WHERE clause: headline counts for the KPI cards. */
export const groupCount = async (
  table: PgTable,
  column: AnyColumn,
  where: SQL | undefined,
): Promise<{ key: string; count: number }[]> => {
  const rows = await db
    .select({ key: sql<string>`${column}`, count: sql<number>`count(*)::int` })
    .from(table)
    .where(where)
    .groupBy(sql`${column}`);
  return rows.map((r) => ({ key: String(r.key), count: r.count }));
};
