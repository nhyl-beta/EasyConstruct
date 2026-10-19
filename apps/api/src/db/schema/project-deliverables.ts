// apps/api/src/db/schema/project-deliverables.ts
//
// "Plan sets" of a Design-delivery project: one row per discipline the client
// is buying drawings for. Progress of a Design project is the average of these
// rows' status points (see lifecycle/delivery.ts). project_code is the usual
// loose string reference, so reset-demo-data deletes these explicitly.
import { integer, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const projectDeliverables = pgTable(
  "project_deliverables",
  {
    id: serial("id").primaryKey(),
    projectCode: varchar("project_code", { length: 50 }).notNull(),
    // Architectural | Structural | MEP | Civil | Interior
    discipline: varchar("discipline", { length: 30 }).notNull(),
    sheetRange: varchar("sheet_range", { length: 100 }),
    leadUserId: integer("lead_user_id").references(() => users.id),
    leadName: varchar("lead_name", { length: 100 }),
    // not_started | in_progress | for_review | approved | issued
    status: varchar("status", { length: 20 }).notNull().default("not_started"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [uniqueIndex("project_deliverables_project_discipline_uq").on(t.projectCode, t.discipline)],
);

export type ProjectDeliverable = typeof projectDeliverables.$inferSelect;
export type NewProjectDeliverable = typeof projectDeliverables.$inferInsert;
