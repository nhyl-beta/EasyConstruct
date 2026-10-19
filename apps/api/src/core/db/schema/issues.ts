import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const issues = pgTable("issues", {
  id: serial("id").primaryKey(),
  issueCode: varchar("issue_code", { length: 20 }).notNull().unique(),
  projectCode: varchar("project_code", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 30 }).notNull().default("Other"),
  // Technical | Structural | Material | Schedule | Resource | Quality | Safety | Other
  severity: varchar("severity", { length: 20 }).notNull().default("Medium"), // Low | Medium | High | Critical
  status: varchar("status", { length: 20 }).notNull().default("Submitted"),  // Submitted | Under Review | Resolved | Rejected
  siteContext: varchar("site_context", { length: 255 }),
  attachmentUrl: varchar("attachment_url", { length: 500 }),
  reportedByUserId: integer("reported_by_user_id").references(() => users.id),
  reportedByName: varchar("reported_by_name", { length: 100 }).notNull(),
  reportedByRole: varchar("reported_by_role", { length: 50 }).notNull(),
  resolutionNotes: text("resolution_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;