// apps/api/src/db/schema/plan-suggestions.ts (objectives fix 3.1)
//
// A draft plan generated when a proposal's Design Proposal Approval workflow
// completes: milestones, tasks and responsibilities the Project Manager reviews
// item by item. Nothing here is applied automatically. `project_code` is the
// usual loose string reference (no FK).
import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { proposals } from "./proposals.js";

export const planSuggestions = pgTable(
  "plan_suggestions",
  {
    id: serial("id").primaryKey(),
    projectCode: varchar("project_code", { length: 50 }).notNull(),
    proposalId: integer("proposal_id")
      .notNull()
      .references(() => proposals.id),
    // open: items still pending. complete: every item accepted or discarded.
    status: varchar("status", { length: 20 }).notNull().default("open"),
    // Template and date source in plain words, shown above the plan.
    basis: text("basis").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("plan_suggestions_proposal_unique").on(t.proposalId)],
);

export const planSuggestionItems = pgTable("plan_suggestion_items", {
  id: serial("id").primaryKey(),
  suggestionId: integer("suggestion_id")
    .notNull()
    .references(() => planSuggestions.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 20 }).notNull(), // milestone | task | responsibility
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  state: varchar("state", { length: 20 }).notNull().default("pending"), // pending | accepted | discarded
  // The record an accepted item created, e.g. "milestone:12" or "task:55".
  createdRef: varchar("created_ref", { length: 50 }),
  decidedBy: varchar("decided_by", { length: 100 }),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type PlanSuggestion = typeof planSuggestions.$inferSelect;
export type PlanSuggestionItem = typeof planSuggestionItems.$inferSelect;
