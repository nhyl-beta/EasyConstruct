import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "../db/connection.js";
import { payrollBatches } from "../db/schema/finance.js";
import { payrollBatchAcknowledgements, payrollBatchDecisions } from "../db/schema/payroll.js";
import type { Db } from "./repository.js";

export type BatchRow = typeof payrollBatches.$inferSelect;

export const findAll = async () => {
  return await db.select().from(payrollBatches).orderBy(desc(payrollBatches.createdAt));
};

/** Approved batches of one period, newest first (same order as findAll). */
export const findApprovedForPeriod = async (period: string) =>
  db
    .select()
    .from(payrollBatches)
    .where(and(eq(payrollBatches.status, "approved"), eq(payrollBatches.period, period)))
    .orderBy(desc(payrollBatches.createdAt));

/** Ids of batches HR is still building (status "draft") — id column only. */
export const findDraftIds = async (): Promise<Set<string>> => {
  const rows = await db
    .select({ id: payrollBatches.id })
    .from(payrollBatches)
    .where(eq(payrollBatches.status, "draft"));
  return new Set(rows.map((r) => r.id));
};

export const findById = async (id: string, client: Db = db) => {
  const [row] = await client.select().from(payrollBatches).where(eq(payrollBatches.id, id));
  return row ?? null;
};

// Other batches (any status except `excludeId`) for the same project + period.
export const findSameProjectPeriod = async (
  projectCode: string,
  period: string,
  excludeId?: string,
) => {
  const rows = await db
    .select()
    .from(payrollBatches)
    .where(and(eq(payrollBatches.projectCode, projectCode), eq(payrollBatches.period, period)));
  return excludeId ? rows.filter((r) => r.id !== excludeId) : rows;
};

export const create = async (data: typeof payrollBatches.$inferInsert, client: Db = db) => {
  const [created] = await client.insert(payrollBatches).values(data).returning();
  return created;
};

export const update = async (
  id: string,
  data: Partial<typeof payrollBatches.$inferInsert>,
  client: Db = db,
) => {
  const [updated] = await client
    .update(payrollBatches)
    .set(data)
    .where(eq(payrollBatches.id, id))
    .returning();
  return updated ?? null;
};

/**
 * Compare-and-set a status change: only succeeds while the batch is still in
 * `from`. This is what makes two concurrent decisions on one batch safe —
 * exactly one UPDATE matches the row.
 */
export const transition = async (
  id: string,
  from: string[],
  data: Partial<typeof payrollBatches.$inferInsert>,
  client: Db = db,
) => {
  const [row] = await client
    .update(payrollBatches)
    .set(data)
    .where(and(eq(payrollBatches.id, id), inArray(payrollBatches.status, from)))
    .returning();
  return row ?? null;
};

export const removeBatch = async (id: string, client: Db = db) => {
  const [deleted] = await client
    .delete(payrollBatches)
    .where(and(eq(payrollBatches.id, id), ne(payrollBatches.status, "approved")))
    .returning();
  return deleted ?? null;
};

export const findDecisions = async (batchId: string) =>
  db
    .select()
    .from(payrollBatchDecisions)
    .where(eq(payrollBatchDecisions.batchId, batchId))
    .orderBy(payrollBatchDecisions.round, payrollBatchDecisions.id);

export const insertDecision = async (
  data: typeof payrollBatchDecisions.$inferInsert,
  client: Db = db,
) => {
  const [row] = await client.insert(payrollBatchDecisions).values(data).returning();
  return row;
};


/** Records the warnings HR acknowledged for one submission round (re-submitting the same round replaces it). */
export const saveAcknowledgements = async (data: {
  batchId: string;
  round: number;
  acknowledgedBy: string;
  items: { key: string; message: string }[];
}) => {
  await db
    .insert(payrollBatchAcknowledgements)
    .values(data)
    .onConflictDoUpdate({
      target: [payrollBatchAcknowledgements.batchId, payrollBatchAcknowledgements.round],
      set: { acknowledgedBy: data.acknowledgedBy, items: data.items, acknowledgedAt: new Date() },
    });
};

export const findAcknowledgements = async (batchId: string) =>
  db
    .select()
    .from(payrollBatchAcknowledgements)
    .where(eq(payrollBatchAcknowledgements.batchId, batchId))
    .orderBy(desc(payrollBatchAcknowledgements.round));
