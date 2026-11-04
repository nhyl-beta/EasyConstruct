import { index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// An account-related help request from any signed-in user to IT (migration 0043). Only IT can act on one.
export const supportRequests = pgTable(
  "support_requests",
  {
    id: serial("id").primaryKey(),
    requesterUserId: integer("requester_user_id").references(() => users.id, { onDelete: "set null" }),
    requesterName: varchar("requester_name", { length: 100 }).notNull(),
    requesterRole: varchar("requester_role", { length: 50 }).notNull(),
    // password_reset | email_name_change | role_access | cannot_sign_in | other_account
    category: varchar("category", { length: 30 }).notNull(),
    subject: varchar("subject", { length: 150 }).notNull(),
    details: text("details").notNull(),
    // open | in_progress | resolved | declined
    status: varchar("status", { length: 20 }).notNull().default("open"),
    resolutionNote: text("resolution_note"),
    handledBy: varchar("handled_by", { length: 100 }),
    handledAt: timestamp("handled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("support_requests_requester_idx").on(t.requesterUserId, t.createdAt),
    index("support_requests_status_idx").on(t.status, t.createdAt),
  ],
);

export type SupportRequest = typeof supportRequests.$inferSelect;
