import { and, eq, ilike, or, SQL } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { budgetAdjustments } from "../../db/schema/finance.js";
import type {
  BudgetAdjustmentFilters,
  CreateBudgetAdjustmentInput,
  UpdateBudgetAdjustmentInput,
} from "./types.js";

const toDto = (row: typeof budgetAdjustments.$inferSelect) => ({
  ...row,
  originalAmount: Number(row.originalAmount),
  adjustmentAmount: Number(row.adjustmentAmount),
  newAmount: Number(row.newAmount),
});

export const findAll = async (filters: BudgetAdjustmentFilters = {}) => {
  const conditions: SQL[] = [];

  if (filters.budgetId)
    conditions.push(eq(budgetAdjustments.budgetId, filters.budgetId));
  if (filters.kind && filters.kind !== "all")
    conditions.push(eq(budgetAdjustments.kind, filters.kind as any));
  if (filters.status && filters.status !== "all")
    conditions.push(eq(budgetAdjustments.status, filters.status as any));
  if (filters.search) {
    const s = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(budgetAdjustments.reason, s),
        ilike(budgetAdjustments.requestedBy, s),
      )!,
    );
  }

  const rows = conditions.length
    ? await db
        .select()
        .from(budgetAdjustments)
        .where(and(...conditions))
    : await db.select().from(budgetAdjustments);

  return rows.map(toDto);
};

export const findById = async (id: number) => {
  const [row] = await db
    .select()
    .from(budgetAdjustments)
    .where(eq(budgetAdjustments.id, id));
  return row ? toDto(row) : null;
};

export const create = async (data: CreateBudgetAdjustmentInput) => {
  const [created] = await db.insert(budgetAdjustments).values(data).returning();
  if (!created) throw new Error("Failed to create budget adjustment");
  return toDto(created);
};

export const update = async (id: number, data: UpdateBudgetAdjustmentInput) => {
  const [updated] = await db
    .update(budgetAdjustments)
    .set(data)
    .where(eq(budgetAdjustments.id, id))
    .returning();
  return updated ? toDto(updated) : null;
};

export const remove = async (id: number) => {
  const [deleted] = await db
    .delete(budgetAdjustments)
    .where(eq(budgetAdjustments.id, id))
    .returning();
  return deleted ? toDto(deleted) : null;
};
