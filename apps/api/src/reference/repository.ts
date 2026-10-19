// apps/api/src/reference/repository.ts (objectives fix 1.2): clients and vendors share one shape.
import { asc, eq, ilike, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { clients, vendors } from "../db/schema/reference.js";

export type ReferenceKind = "clients" | "vendors";

const table = (kind: ReferenceKind) => (kind === "clients" ? clients : vendors);

export const findAll = async (kind: ReferenceKind, search?: string) => {
  const t = table(kind);
  const q = db.select().from(t);
  const rows = search?.trim() ? await q.where(ilike(t.name, `%${search.trim()}%`)).orderBy(asc(t.name)) : await q.orderBy(asc(t.name));
  return rows;
};

/** Every name, for the duplicate check (the lists are short: companies, not transactions). */
export const findNames = async (kind: ReferenceKind) => {
  const t = table(kind);
  return db.select({ id: t.id, name: t.name }).from(t);
};

export const findByKey = async (kind: ReferenceKind, nameKey: string) => {
  const t = table(kind);
  const [row] = await db.select().from(t).where(eq(t.nameKey, nameKey));
  return row ?? null;
};

export const findById = async (kind: ReferenceKind, id: number) => {
  const t = table(kind);
  const [row] = await db.select().from(t).where(eq(t.id, id));
  return row ?? null;
};

/** Insert-or-nothing on the unique name key, so two people adding the same company at once get one row. */
export const insert = async (kind: ReferenceKind, data: { name: string; nameKey: string; createdBy?: string }) => {
  const t = table(kind);
  const [row] = await db.insert(t).values(data).onConflictDoNothing().returning();
  return row ?? null;
};

export const count = async (kind: ReferenceKind) => {
  const t = table(kind);
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(t);
  return row?.n ?? 0;
};
