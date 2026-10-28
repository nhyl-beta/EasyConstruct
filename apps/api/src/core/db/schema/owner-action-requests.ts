import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// A change to the Owner account that is waiting for the Owner's approval by email (migration 0042). Only the
// SHA-256 of the emailed token is stored. A password reset keeps just the bcrypt hash in `payload`, never the plaintext.
export const ownerActionRequests = pgTable(
  "owner_action_requests",
  {
    id: serial("id").primaryKey(),
    targetUserId: integer("target_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 30 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    requestedByUserId: integer("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    requestedByName: varchar("requested_by_name", { length: 100 }).notNull(),
    // pending | approved | declined | expired | cancelled
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    decidedAt: timestamp("decided_at"),
    decidedIp: varchar("decided_ip", { length: 64 }),
    executedAt: timestamp("executed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("owner_action_requests_one_pending_uq").on(t.targetUserId, t.action).where(sql`${t.status} = 'pending'`),
    index("owner_action_requests_requester_idx").on(t.requestedByUserId, t.createdAt),
  ],
);

export type OwnerActionRequest = typeof ownerActionRequests.$inferSelect;
