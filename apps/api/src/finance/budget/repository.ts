import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { budgets } from "../../db/schema/finance.js";

import type {
  BudgetFilters,
  CreateBudgetInput,
  UpdateBudgetInput,
} from "./types.js";

const toDto = (row: typeof budgets.$inferSelect) => {
  const { actual, ...rest } = row;

  return {
    ...rest,
    planned: Number(row.planned),
    committed: Number(row.committed),
    spent: Number(actual),
  };
};

export const findAll = async (filters: BudgetFilters = {}) => {
  const conditions: SQL[] = [];

  if (filters.fiscalYear && filters.fiscalYear !== "all") {
    conditions.push(eq(budgets.fiscalYear, filters.fiscalYear));
  }

  if (filters.status && filters.status !== "all") {
    conditions.push(eq(budgets.status, filters.status));
  }

  if (filters.search) {
    const q = `%${filters.search}%`;

    conditions.push(
      or(
        ilike(budgets.project, q),
        ilike(budgets.owner, q),
        ilike(budgets.category, q),
      )!,
    );
  }

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(budgets)
          .where(and(...conditions))
      : await db.select().from(budgets);

  return rows.map(toDto);
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(budgets).where(eq(budgets.id, id));

  return row ? toDto(row) : null;
};

// G5/G6: the join key an approved payroll batch or expense needs to find
// "the budget it counts against" — there is no FK from either onto budgets,
// so this is a best-effort match on (project, category); ties (e.g. across
// fiscal years) resolve to the most recently created row.
export const findByProjectAndCategory = async (project: string, category: string) => {
  const rows = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.project, project), eq(budgets.category, category)));
  if (rows.length === 0) return null;
  const latest = rows.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
  return toDto(latest);
};

export const create = async (data: CreateBudgetInput) => {
  const [created] = await db
    .insert(budgets)
    .values({
      project: data.project,
      category: data.category,
      owner: data.owner,

      planned: data.planned,
      committed: data.committed ?? 0,
      actual: data.spent ?? 0,

      fiscalYear: data.fiscalYear,

      status: data.status ?? "draft",
    })
    .returning();

  if (!created) {
    throw new Error("Failed to create budget.");
  }

  return toDto(created);
};

export const update = async (id: number, data: UpdateBudgetInput) => {
  const updateData: Partial<typeof budgets.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.project !== undefined) updateData.project = data.project;

  if (data.category !== undefined) updateData.category = data.category;

  if (data.owner !== undefined) updateData.owner = data.owner;

  if (data.planned !== undefined) updateData.planned = data.planned;

  if (data.committed !== undefined) updateData.committed = data.committed;

  if (data.spent !== undefined) updateData.actual = data.spent;

  if (data.fiscalYear !== undefined) updateData.fiscalYear = data.fiscalYear;

  if (data.status !== undefined) updateData.status = data.status;

  const [updated] = await db
    .update(budgets)
    .set(updateData)
    .where(eq(budgets.id, id))
    .returning();

  return updated ? toDto(updated) : null;
};

export const remove = async (id: number) => {
  const [deleted] = await db
    .delete(budgets)
    .where(eq(budgets.id, id))
    .returning();

  return deleted ? toDto(deleted) : null;
};
