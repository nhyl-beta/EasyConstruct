// apps/api/src/reference/document-types/repository.ts (client demo change #1)
import { asc, eq, sql } from "drizzle-orm";
import { db } from "../../core/db/connection.js";
import { documents } from "../../core/db/schema/documents.js";
import { documentTypes, type DocumentType } from "../../core/db/schema/document-types.js";
import { DOCUMENT_TYPE_SEEDS, normalizeTypeName } from "./rules.js";

export const findAll = (opts: { includeInactive: boolean }): Promise<DocumentType[]> => {
  const q = db.select().from(documentTypes);
  return (opts.includeInactive ? q : q.where(eq(documentTypes.active, true))).orderBy(asc(documentTypes.category), asc(documentTypes.name));
};

export const findById = async (id: number): Promise<DocumentType | null> => {
  const [row] = await db.select().from(documentTypes).where(eq(documentTypes.id, id));
  return row ?? null;
};

/** Insert-or-nothing on the unique name key, so two people adding the same type at once get one row. */
export const insert = async (data: { name: string; nameKey: string; category: string; isSystem?: boolean; createdBy?: string }) => {
  const [row] = await db.insert(documentTypes).values(data).onConflictDoNothing().returning();
  return row ?? null;
};

/**
 * Updates a type. A rename also moves the documents filed under the old name, in the same
 * transaction, so they stay under their type (documents.type holds the name).
 */
export const update = async (id: number, previousName: string, patch: { name?: string; nameKey?: string; category?: string; active?: boolean }) =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .update(documentTypes)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(documentTypes.id, id))
      .returning();
    if (row && patch.name !== undefined && patch.name !== previousName) {
      await tx.update(documents).set({ type: patch.name }).where(eq(documents.type, previousName));
    }
    return row ?? null;
  });

export const countDocumentsOfType = async (name: string): Promise<number> => {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(documents).where(eq(documents.type, name));
  return row?.n ?? 0;
};

/** Idempotent: adds any seed type that is missing and never touches an existing row. */
export const seedMissing = async (createdBy = "system"): Promise<number> => {
  let added = 0;
  for (const s of DOCUMENT_TYPE_SEEDS) {
    const inserted = await insert({ name: s.name, nameKey: normalizeTypeName(s.name), category: s.category, isSystem: s.isSystem, createdBy });
    if (inserted) added++;
  }
  return added;
};
