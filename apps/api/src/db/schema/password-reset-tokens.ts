import { integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// One row per issued password-reset link. Only the SHA-256 of the token is
// stored: a database leak must not yield usable reset links. A token is bound
// to `userId` — the account whose password it changes, which for the Owner's
// fail-safe recovery is the IT Designer, never the Owner who requested it.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  // Who asked for it: the account itself (forgot-password) or the Owner
  // (fail-safe recovery). Null only for rows predating the audit trail.
  requestedByUserId: integer("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at").notNull(),
  // Set when the link is redeemed, or when a newer link supersedes it.
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
