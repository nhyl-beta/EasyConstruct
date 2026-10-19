// repository.ts
import { db } from "../db/connection.js";
import { architectDocuments } from "../db/schema/architect-documents.js";
import { eq, ilike, and, or, SQL } from 'drizzle-orm';
import type { CreateArchitectDocumentInput, UpdateArchitectDocumentInput, ArchitectDocumentFilters } from "./types.js";

export const findAll = async (filters: ArchitectDocumentFilters = {}) => {
  const conditions: SQL[] = [];
  if (filters.category && filters.category !== 'all') conditions.push(eq(architectDocuments.category, filters.category));
  if (filters.search) conditions.push(ilike(architectDocuments.title, `%${filters.search}%`));

  return conditions.length
    ? await db.select().from(architectDocuments).where(and(...conditions))
    : await db.select().from(architectDocuments);
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(architectDocuments).where(eq(architectDocuments.id, id));
  return row ?? null;
};

export const create = async (data: CreateArchitectDocumentInput) => {
  const [created] = await db.insert(architectDocuments).values(data).returning();
  return created;
};

export const update = async (id: number, data: UpdateArchitectDocumentInput) => {
  const [updated] = await db.update(architectDocuments).set({ ...data, updatedAt: new Date() }).where(eq(architectDocuments.id, id)).returning();
  return updated ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db.delete(architectDocuments).where(eq(architectDocuments.id, id)).returning();
  return deleted ?? null;
};