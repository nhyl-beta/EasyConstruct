// apps/api/src/db/schema/project-phase-history.ts — NEW
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

// One row per lifecycle transition (advance/hold/resume/cancel/archive) —
// the audit_logs table already records "something happened", but not the
// gate-check snapshot that justified an advance, which the closeout summary
// and X3 (payroll batches created after Closeout) both need to read back.
export const projectPhaseHistory = pgTable("project_phase_history", {
  id: serial("id").primaryKey(),
  projectCode: varchar("project_code", { length: 50 }).notNull(),
  fromStatus: varchar("from_status", { length: 50 }).notNull(),
  toStatus: varchar("to_status", { length: 50 }).notNull(),
  changedBy: varchar("changed_by", { length: 100 }).notNull(),
  changedByUserId: integer("changed_by_user_id").references(() => users.id),
  reason: text("reason"),
  override: boolean("override").notNull().default(false),
  gateSnapshot: jsonb("gate_snapshot"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ProjectPhaseHistoryRow = typeof projectPhaseHistory.$inferSelect;
export type NewProjectPhaseHistoryRow = typeof projectPhaseHistory.$inferInsert;
