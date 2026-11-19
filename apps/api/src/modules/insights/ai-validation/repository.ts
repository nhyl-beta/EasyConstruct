// apps/api/src/ai-validation/repository.ts — NEW (ai-signals C7)
import { db } from "../../../core/db/connection.js";
import { validationResults, type ValidationResultRow } from "../../../core/db/schema/ai-validation.js";
import { and, desc, eq, inArray } from "drizzle-orm";

// One row per line item — the most recent validation_results row for each
// entityId, not the full history. A line item validated more than once
// (e.g. after a C8 re-check) only ever shows its latest verdict.
// entityId is only unique WITHIN an entityType (workflowLineItems.id is a global serial, but a
// Purchase Request line's entityId is just its index in that request's own lineItems array), so
// entityType must always be passed and filtered on — otherwise two different line items from
// two different entity types could collide on the same small entityId.
export const findLatestByLineItemIds = async (entityType: string, lineItemIds: number[]): Promise<Map<number, ValidationResultRow>> => {
  if (lineItemIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(validationResults)
    .where(and(eq(validationResults.entityType, entityType), inArray(validationResults.entityId, lineItemIds)))
    .orderBy(desc(validationResults.createdAt));

  const latestByEntityId = new Map<number, ValidationResultRow>();
  for (const row of rows) {
    if (!latestByEntityId.has(row.entityId)) latestByEntityId.set(row.entityId, row);
  }
  return latestByEntityId;
};

// Purchase Request line items reuse entityId across different requests (it's just an array
// index), so a lookup for one request must also filter by purchaseRequestId, not entityId alone.
export const findLatestForPurchaseRequest = async (purchaseRequestId: string): Promise<Map<number, ValidationResultRow>> => {
  const rows = await db
    .select()
    .from(validationResults)
    .where(and(eq(validationResults.entityType, "purchase_request_line_item"), eq(validationResults.purchaseRequestId, purchaseRequestId)))
    .orderBy(desc(validationResults.createdAt));

  const latestByEntityId = new Map<number, ValidationResultRow>();
  for (const row of rows) {
    if (!latestByEntityId.has(row.entityId)) latestByEntityId.set(row.entityId, row);
  }
  return latestByEntityId;
};
