// repository.ts
import { db } from "../../db/connection.js";
import { designReviews } from "../../db/schema/design-reviews.js";
import { eq, and, desc, SQL } from 'drizzle-orm';
import type { CreateDesignReviewInput, DesignReviewFilters } from "./types.js";

// B3: had no ORDER BY at all — Postgres returned rows in whatever order the
// planner picked (in practice, roughly insertion/id order, i.e. oldest
// first), so the consultant's review list read oldest-first with no way to
// tell without checking dates. `submittedAt` is this table's createdAt
// equivalent (set once, on insert, via `defaultNow()`).
export const findAll = async (filters: DesignReviewFilters = {}) => {
  const conditions: SQL[] = [];
  if (filters.designId) conditions.push(eq(designReviews.designId, filters.designId));
  if (filters.status && filters.status !== 'all') conditions.push(eq(designReviews.status, filters.status));

  return conditions.length
    ? await db.select().from(designReviews).where(and(...conditions)).orderBy(desc(designReviews.submittedAt))
    : await db.select().from(designReviews).orderBy(desc(designReviews.submittedAt));
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(designReviews).where(eq(designReviews.id, id));
  return row ?? null;
};

export const create = async (data: CreateDesignReviewInput) => {
  const [created] = await db.insert(designReviews).values(data).returning();
  return created;
};

export const decide = async (id: number, status: string) => {
  const [updated] = await db
    .update(designReviews)
    .set({ status, completedAt: new Date() })
    .where(eq(designReviews.id, id))
    .returning();
  return updated ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db.delete(designReviews).where(eq(designReviews.id, id)).returning();
  return deleted ?? null;
};