// apps/api/src/db/schema/project-stakeholders.ts (client demo change #4)
//
// The people outside the company a project deals with: the owner, the contractor, anyone else. RFIs and
// RFAs are sent to them. `projects.client` / `client_email` stay as they were and are kept in step with the
// first Owner row, so older screens keep working. `project_code` is the usual loose reference (no FK).
import { index, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const projectStakeholders = pgTable(
  "project_stakeholders",
  {
    id: serial("id").primaryKey(),
    projectCode: varchar("project_code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    company: varchar("company", { length: 255 }),
    role: varchar("role", { length: 20 }).notNull(), // Owner | Contractor | Other
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    createdBy: varchar("created_by", { length: 100 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("project_stakeholders_project_idx").on(t.projectCode)],
);

export type ProjectStakeholder = typeof projectStakeholders.$inferSelect;
