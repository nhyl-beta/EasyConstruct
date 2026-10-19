// apps/api/src/plan-suggestion/repository.ts (objectives fix 3.1)
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../core/db/connection.js";
import { planSuggestionItems, planSuggestions } from "../core/db/schema/plan-suggestions.js";
import { documents } from "../core/db/schema/documents.js";

export const findByProposal = async (proposalId: number) => {
  const [row] = await db.select().from(planSuggestions).where(eq(planSuggestions.proposalId, proposalId));
  return row ?? null;
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(planSuggestions).where(eq(planSuggestions.id, id));
  return row ?? null;
};

export const findByProject = async (projectCode: string) =>
  db.select().from(planSuggestions).where(eq(planSuggestions.projectCode, projectCode)).orderBy(desc(planSuggestions.id));

/** Insert-or-nothing keyed on the unique proposal id, so concurrent triggers make one suggestion. */
export const createSuggestion = async (data: { projectCode: string; proposalId: number; basis: string }) => {
  const [row] = await db.insert(planSuggestions).values(data).onConflictDoNothing().returning();
  return row ?? null;
};

export const updateSuggestion = async (id: number, data: Partial<{ status: string; basis: string }>) => {
  const [row] = await db.update(planSuggestions).set(data).where(eq(planSuggestions.id, id)).returning();
  return row ?? null;
};

export const addItems = async (
  suggestionId: number,
  items: { kind: string; payload: Record<string, unknown> }[],
) => {
  if (items.length === 0) return [];
  return db
    .insert(planSuggestionItems)
    .values(items.map((i) => ({ suggestionId, kind: i.kind, payload: i.payload })))
    .returning();
};

export const findItems = async (suggestionIds: number[]) => {
  if (suggestionIds.length === 0) return [];
  return db
    .select()
    .from(planSuggestionItems)
    .where(inArray(planSuggestionItems.suggestionId, suggestionIds))
    .orderBy(planSuggestionItems.id);
};

export const findItem = async (itemId: number) => {
  const [row] = await db.select().from(planSuggestionItems).where(eq(planSuggestionItems.id, itemId));
  return row ?? null;
};

export const deletePendingItems = async (suggestionId: number) =>
  db
    .delete(planSuggestionItems)
    .where(and(eq(planSuggestionItems.suggestionId, suggestionId), eq(planSuggestionItems.state, "pending")));

/** Moves a pending item to accepted or discarded. Returns null if it was no longer pending (already decided). */
export const decideItem = async (
  itemId: number,
  data: { state: "accepted" | "discarded"; createdRef?: string | null; decidedBy: string },
) => {
  const [row] = await db
    .update(planSuggestionItems)
    .set({ state: data.state, createdRef: data.createdRef ?? null, decidedBy: data.decidedBy, decidedAt: new Date() })
    .where(and(eq(planSuggestionItems.id, itemId), eq(planSuggestionItems.state, "pending")))
    .returning();
  return row ?? null;
};

/** Date the project's latest Notice to Proceed document was filed (documents carry no date of their own). */
export const findNoticeToProceedDate = async (projectCode: string): Promise<string | null> => {
  const [row] = await db
    .select({ createdAt: documents.createdAt })
    .from(documents)
    .where(and(eq(documents.project, projectCode), eq(documents.type, "Notice to Proceed")))
    .orderBy(desc(documents.createdAt))
    .limit(1);
  return row?.createdAt ? row.createdAt.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : null;
};
