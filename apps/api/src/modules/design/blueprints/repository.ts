// repository.ts
import { db } from "../../../core/db/connection.js";
import { blueprints } from "../../../core/db/schema/blueprints.js";
import { desc, eq, ilike, and, or, SQL } from 'drizzle-orm';
import type { CreateBlueprintInput, UpdateBlueprintInput, BlueprintFilters } from "./types.js";

export const findAll = async (filters: BlueprintFilters = {}) => {
  const conditions: SQL[] = [];
  if (filters.folder && filters.folder !== 'all') conditions.push(eq(blueprints.folder, filters.folder));
  if (filters.projectCode) conditions.push(eq(blueprints.projectCode, filters.projectCode));
  if (filters.search) {
    const s = `%${filters.search}%`;
    conditions.push(or(ilike(blueprints.title, s), ilike(blueprints.drawingNumber, s))!);
  }

  // Newest submission first — the default order every reviewer sees before
  // any explicit sort/filter is applied.
  return conditions.length
    ? await db.select().from(blueprints).where(and(...conditions)).orderBy(desc(blueprints.id))
    : await db.select().from(blueprints).orderBy(desc(blueprints.id));
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(blueprints).where(eq(blueprints.id, id));
  return row ?? null;
};

export const create = async (data: CreateBlueprintInput) => {
  const [created] = await db.insert(blueprints).values(data).returning();
  return created;
};

export const update = async (id: number, data: UpdateBlueprintInput) => {
  const [updated] = await db.update(blueprints).set(data).where(eq(blueprints.id, id)).returning();
  return updated ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db.delete(blueprints).where(eq(blueprints.id, id)).returning();
  return deleted ?? null;
};