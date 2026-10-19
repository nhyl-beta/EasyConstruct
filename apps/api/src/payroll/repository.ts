import { and, desc, eq, inArray, isNull, notInArray, or, sql, SQL } from "drizzle-orm";
import { countRows, selectPage } from "../db/paged.js";
import { db } from "../db/connection.js";
import { payroll } from "../db/schema/payroll.js";
import type { PayrollFilters } from "./types.js";

// Either the shared pool-backed db or a transaction handle.
export type Db = Pick<typeof db, "select" | "insert" | "update" | "delete">;

const buildConditions = (filters: PayrollFilters): SQL[] => {
  const conditions: SQL[] = [];

  if (filters.period) conditions.push(eq(payroll.period, filters.period));
  if (filters.empId) conditions.push(eq(payroll.empId, filters.empId));
  if (filters.batchId) conditions.push(eq(payroll.batchId, filters.batchId));
  if (filters.status && filters.status !== "all")
    conditions.push(eq(payroll.status, filters.status));
  if (filters.excludeBatchIds?.length)
    conditions.push(or(isNull(payroll.batchId), notInArray(payroll.batchId, filters.excludeBatchIds))!);
  return conditions;
};

export const PAYROLL_SORT_COLUMNS = {
  name: payroll.name,
  empId: payroll.empId,
  period: payroll.period,
  status: payroll.status,
  gross: payroll.gross,
  net: payroll.net,
  createdAt: payroll.createdAt,
} as const;

export const defaultPayrollOrder = [desc(payroll.id)];

export const countFiltered = async (filters: PayrollFilters = {}) => {
  const conditions = buildConditions(filters);
  return countRows(payroll, conditions.length ? and(...conditions) : undefined);
};

/** Sums over a filter set - what the tracksheet's headline cards show. */
export const sumFiltered = async (filters: PayrollFilters = {}) => {
  const conditions = buildConditions(filters);
  const [row] = await db
    .select({
      lines: sql<number>`count(*)::int`,
      gross: sql<string>`coalesce(sum(${payroll.gross}), 0)`,
      net: sql<string>`coalesce(sum(${payroll.net}), 0)`,
      employerCost: sql<string>`coalesce(sum(${payroll.employerCost}), 0)`,
      hours: sql<string>`coalesce(sum(${payroll.hours}), 0)`,
    })
    .from(payroll)
    .where(conditions.length ? and(...conditions) : undefined);
  return {
    lines: row?.lines ?? 0,
    gross: Number(row?.gross ?? 0),
    net: Number(row?.net ?? 0),
    employerCost: Number(row?.employerCost ?? 0),
    hours: Number(row?.hours ?? 0),
  };
};

export const findPage = async (filters: PayrollFilters, window: { limit: number; offset: number }, orderBy: SQL[]) => {
  const conditions = buildConditions(filters);
  return selectPage(payroll, conditions.length ? and(...conditions) : undefined, orderBy, window);
};

export const findAll = async (filters: PayrollFilters = {}) => {
  const conditions = buildConditions(filters);

  return conditions.length
    ? await db.select().from(payroll).where(and(...conditions))
    : await db.select().from(payroll);
};

export const findByBatch = async (batchId: string, client: Db = db) =>
  client.select().from(payroll).where(eq(payroll.batchId, batchId)).orderBy(payroll.id);

/** Lines of several batches in one query, grouped by batch id (each group ordered by line id). */
export const findByBatches = async (batchIds: string[]) => {
  const grouped = new Map<string, (typeof payroll.$inferSelect)[]>();
  if (batchIds.length === 0) return grouped;
  const rows = await db
    .select()
    .from(payroll)
    .where(inArray(payroll.batchId, batchIds))
    .orderBy(payroll.id);
  for (const row of rows) {
    if (!row.batchId) continue;
    const list = grouped.get(row.batchId) ?? [];
    list.push(row);
    grouped.set(row.batchId, list);
  }
  return grouped;
};

export const findById = async (id: number, client: Db = db) => {
  const [row] = await client.select().from(payroll).where(eq(payroll.id, id));
  return row ?? null;
};

export const create = async (data: typeof payroll.$inferInsert, client: Db = db) => {
  const [created] = await client.insert(payroll).values(data).returning();
  return created;
};

/** Several lines in one INSERT (a batch used to be one INSERT per employee). */
export const createMany = async (rows: (typeof payroll.$inferInsert)[], client: Db = db) =>
  rows.length ? client.insert(payroll).values(rows).returning() : [];

export const update = async (
  id: number,
  data: Partial<typeof payroll.$inferInsert>,
  client: Db = db,
) => {
  const [updated] = await client.update(payroll).set(data).where(eq(payroll.id, id)).returning();
  return updated ?? null;
};

export const remove = async (id: number, client: Db = db) => {
  const [deleted] = await client.delete(payroll).where(eq(payroll.id, id)).returning();
  return deleted ?? null;
};
