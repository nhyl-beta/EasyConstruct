import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { users } from "../db/schema/users.js";
import { auditLogs } from "../db/schema/audit-logs.js";
import { passwordResetTokens } from "../db/schema/password-reset-tokens.js";

export const findByEmail = async (email: string) => {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user ?? null;
};

export const findById = async (id: number) => {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user ?? null;
};

export const updatePassword = async (id: number, password: string) => {
  const [updated] = await db
    .update(users)
    .set({ password, passwordChangedAt: new Date(), tokensValidAfter: new Date(), updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return updated ?? null;
};

// ── Password reset tokens ──────────────────────────────────────────────

export const createResetToken = async (data: {
  userId: number;
  tokenHash: string;
  requestedByUserId: number;
  expiresAt: Date;
}) => {
  const [created] = await db.insert(passwordResetTokens).values(data).returning();
  return created!;
};

export const findResetToken = async (tokenHash: string) => {
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash));
  return row ?? null;
};

/** Marks one token used. False when it was already used (lost a race). */
export const consumeResetToken = async (id: number) => {
  const [row] = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.id, id), isNull(passwordResetTokens.usedAt)))
    .returning({ id: passwordResetTokens.id });
  return !!row;
};

/** Invalidates every still-open link for the account. */
export const revokeOpenResetTokens = async (userId: number) => {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
};

/**
 * What the session check needs about an account: when its password last changed
 * (older tokens are signed out) and whether it is still active (a deactivated
 * account's existing tokens stop working). undefined when the account is gone.
 */
export const findSessionState = async (id: number) => {
  const [row] = await db
    .select({ passwordChangedAt: users.passwordChangedAt, tokensValidAfter: users.tokensValidAfter, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, id));
  return row
    ? { changedAt: row.passwordChangedAt ?? null, validAfter: row.tokensValidAfter ?? null, isActive: row.isActive }
    : undefined;
};

/** Signs the account out everywhere: every token issued before now stops working. */
export const revokeTokens = async (id: number) => {
  await db.update(users).set({ tokensValidAfter: new Date() }).where(eq(users.id, id));
};

export const findPasswordChangedAt = async (id: number) => {
  const [row] = await db
    .select({ passwordChangedAt: users.passwordChangedAt })
    .from(users)
    .where(eq(users.id, id));
  return row ? (row.passwordChangedAt ?? null) : undefined;
};

/**
 * Times of the most recent failed sign-ins recorded for an email address since
 * `since` (newest first, at most `limit`). Read from the audit trail that
 * auth/service.ts already writes, so the account limit needs no table of its own.
 */
export const findRecentLoginFailures = async (email: string, since: Date, limit: number): Promise<Date[]> => {
  const rows = await db
    .select({ at: auditLogs.createdAt })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.entityType, "auth"),
        eq(auditLogs.action, "login-failed"),
        sql`lower(${auditLogs.entityId}) = lower(${email})`,
        gte(auditLogs.createdAt, since),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  return rows.map((r) => r.at).filter((d): d is Date => d != null);
};
