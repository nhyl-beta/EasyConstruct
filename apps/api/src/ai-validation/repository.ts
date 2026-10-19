// apps/api/src/ai-validation/repository.ts — NEW (ai-signals C7)
import { db } from "../db/connection.js";
import { validationResults, type ValidationResultRow } from "../db/schema/ai-validation.js";
import { desc, inArray } from "drizzle-orm";

// One row per line item — the most recent validation_results row for each
// entityId, not the full history. A line item validated more than once
// (e.g. after a C8 re-check) only ever shows its latest verdict.
export const findLatestByLineItemIds = async (lineItemIds: number[]): Promise<Map<number, ValidationResultRow>> => {
  if (lineItemIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(validationResults)
    .where(inArray(validationResults.entityId, lineItemIds))
    .orderBy(desc(validationResults.createdAt));

  const latestByEntityId = new Map<number, ValidationResultRow>();
  for (const row of rows) {
    if (!latestByEntityId.has(row.entityId)) latestByEntityId.set(row.entityId, row);
  }
  return latestByEntityId;
};
