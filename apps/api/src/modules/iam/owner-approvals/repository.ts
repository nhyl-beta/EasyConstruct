import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { db } from "../../../core/db/connection.js";
import { ownerActionRequests, type OwnerActionRequest } from "../../../core/db/schema/owner-action-requests.js";
import { REQUEST_WINDOW_MS } from "./rules.js";

type NewRequest = typeof ownerActionRequests.$inferInsert;

export const create = async (row: NewRequest): Promise<OwnerActionRequest | null> => {
  const [created] = await db.insert(ownerActionRequests).values(row).returning();
  return created ?? null;
};

export const findById = async (id: number): Promise<OwnerActionRequest | null> => {
  const [row] = await db.select().from(ownerActionRequests).where(eq(ownerActionRequests.id, id)).limit(1);
  return row ?? null;
};

export const findByTokenHash = async (tokenHash: string): Promise<OwnerActionRequest | null> => {
  const [row] = await db.select().from(ownerActionRequests).where(eq(ownerActionRequests.tokenHash, tokenHash)).limit(1);
  return row ?? null;
};

export const findPending = async (targetUserId: number, action: string): Promise<OwnerActionRequest | null> => {
  const [row] = await db
    .select()
    .from(ownerActionRequests)
    .where(and(eq(ownerActionRequests.targetUserId, targetUserId), eq(ownerActionRequests.action, action), eq(ownerActionRequests.status, "pending")))
    .limit(1);
  return row ?? null;
};

/** Marks every pending request on this target that has run out of time as expired; returns them (for the audit trail). */
export const expireStale = async (targetUserId: number | null, now: Date): Promise<OwnerActionRequest[]> =>
  db
    .update(ownerActionRequests)
    .set({ status: "expired" })
    .where(
      and(
        eq(ownerActionRequests.status, "pending"),
        lt(ownerActionRequests.expiresAt, now),
        targetUserId == null ? undefined : eq(ownerActionRequests.targetUserId, targetUserId),
      ),
    )
    .returning();

/** Creation times of one requester's requests in the last hour (for the rate limit). */
export const recentCreationTimes = async (requestedByUserId: number, now: Date): Promise<Date[]> => {
  const since = new Date(now.getTime() - REQUEST_WINDOW_MS);
  const rows = await db
    .select({ createdAt: ownerActionRequests.createdAt })
    .from(ownerActionRequests)
    .where(and(eq(ownerActionRequests.requestedByUserId, requestedByUserId), gt(ownerActionRequests.createdAt, since)));
  return rows.map((r) => r.createdAt);
};

/**
 * Exactly-once claim: only one caller can move a request from pending to a decided state. A second approval, a
 * decline racing an approval, or a request that has expired matches no row and gets null.
 */
export const claim = async (
  id: number,
  status: "approved" | "declined",
  decidedIp: string,
  now: Date,
): Promise<OwnerActionRequest | null> => {
  const [row] = await db
    .update(ownerActionRequests)
    .set({ status, decidedAt: now, decidedIp })
    .where(and(eq(ownerActionRequests.id, id), eq(ownerActionRequests.status, "pending"), gt(ownerActionRequests.expiresAt, now)))
    .returning();
  return row ?? null;
};

export const markExecuted = async (id: number, now: Date): Promise<void> => {
  await db.update(ownerActionRequests).set({ executedAt: now }).where(eq(ownerActionRequests.id, id));
};

/** Requester cancels their own pending request. */
export const cancel = async (id: number, requestedByUserId: number): Promise<OwnerActionRequest | null> => {
  const [row] = await db
    .update(ownerActionRequests)
    .set({ status: "cancelled", decidedAt: new Date() })
    .where(and(eq(ownerActionRequests.id, id), eq(ownerActionRequests.requestedByUserId, requestedByUserId), eq(ownerActionRequests.status, "pending")))
    .returning();
  return row ?? null;
};

/** Failed to send the email: the request never reached the Owner. */
export const cancelUnsent = async (id: number): Promise<void> => {
  await db.update(ownerActionRequests).set({ status: "cancelled", decidedAt: new Date() }).where(and(eq(ownerActionRequests.id, id), eq(ownerActionRequests.status, "pending")));
};

export const list = async (filter: { requestedByUserId?: number; statuses?: string[]; limit?: number }): Promise<OwnerActionRequest[]> =>
  db
    .select()
    .from(ownerActionRequests)
    .where(
      and(
        filter.requestedByUserId == null ? undefined : eq(ownerActionRequests.requestedByUserId, filter.requestedByUserId),
        filter.statuses?.length ? inArray(ownerActionRequests.status, filter.statuses) : undefined,
      ),
    )
    .orderBy(desc(ownerActionRequests.createdAt))
    .limit(filter.limit ?? 50);

export const countPending = async (): Promise<number> => {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(ownerActionRequests).where(and(eq(ownerActionRequests.status, "pending"), gt(ownerActionRequests.expiresAt, new Date())));
  return row?.n ?? 0;
};
