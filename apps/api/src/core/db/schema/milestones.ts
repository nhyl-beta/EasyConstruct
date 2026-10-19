// apps/api/src/db/schema/milestones.ts — NEW
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// A milestone starts as a "draft" — an estimate the Project Manager is
// staking out, not yet a commitment the project is being held to. Later
// statuses are here so the lifecycle has somewhere to go without a schema
// change, even though only "draft" creation is wired up today.
export const MILESTONE_STATUSES = [
  "draft",
  "active",
  "at-risk",
  "completed",
  "cancelled",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const milestones = pgTable("milestones", {
  id: serial("id").primaryKey(),
  projectCode: varchar("project_code", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  // Stored as a plain date string ("YYYY-MM-DD"), same convention as
  // projects.due — an ESTIMATE at draft time, not a hard deadline.
  estimatedCompletionDate: varchar("estimated_completion_date", { length: 20 }),
  createdBy: varchar("created_by", { length: 100 }).notNull(),
  // Set when the milestone moves to "completed" (milestones/service.ts).
  completedBy: varchar("completed_by", { length: 100 }),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// The kinds of record a milestone can later gate on. Requirements, documents
// and tasks are each their own table with their own id space, and a budget
// "item" isn't even one fixed table (budgets vs. budget_adjustments) — so
// this is a generic (linkType, linkId) pair rather than four separate
// nullable FK columns that would need a new one for every future dependency
// type.
export const MILESTONE_LINK_TYPES = [
  "requirement",
  "document",
  "budget",
  "task",
] as const;
export type MilestoneLinkType = (typeof MILESTONE_LINK_TYPES)[number];

/**
 * What a milestone depends on. Deliberately built now, populated later:
 * nothing in this pass reads or enforces these links — no gating logic
 * exists yet — but the milestone's own row has nowhere to grow this
 * correlation into without a table like this one existing from the start.
 * Adding the actual "is this milestone blocked" computation on top of this
 * table is additive; retrofitting the table onto milestones after the fact
 * would not be.
 */
export const milestoneLinks = pgTable("milestone_links", {
  id: serial("id").primaryKey(),
  milestoneId: integer("milestone_id")
    .notNull()
    .references(() => milestones.id, { onDelete: "cascade" }),
  linkType: varchar("link_type", { length: 20 }).notNull(),
  linkId: integer("link_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;
export type MilestoneLink = typeof milestoneLinks.$inferSelect;
export type NewMilestoneLink = typeof milestoneLinks.$inferInsert;
