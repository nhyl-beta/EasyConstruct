import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { workflows } from "./workflows.js";

export const proposals = pgTable("proposals", {
  id: serial("id").primaryKey(),

  proposalId: varchar("proposal_id", {
    length: 20,
  })
    .notNull()
    .unique(),

  title: varchar("title", {
    length: 255,
  }).notNull(),

  projectCode: varchar("project_code", {
    length: 50,
  }).notNull(),

  submittedBy: varchar("submitted_by", {
    length: 100,
  }).notNull(),

  assignedReviewer: varchar("assigned_reviewer", {
    length: 100,
  }),

  status: varchar("status", {
    length: 50,
  })
    .notNull()
    .default("Pending"),

  amount: varchar("amount", {
    length: 50,
  }),

  content: text("content"),

  aiValidation: text("ai_validation"),

  // Set by POST /api/proposals/submit (D2) — links the proposal to the
  // Design Proposal Approval workflow it opened, so decideStage (D3) has a
  // single source of truth to sync proposal.status from instead of the old
  // PATCH /:id/review writing it directly.
  workflowId: integer("workflow_id").references(() => workflows.id),

  reviewComment: text("review_comment"),

  reviewerName: varchar("reviewer_name", {
    length: 100,
  }),

  reviewedAt: timestamp("reviewed_at"),

  createdAt: timestamp("created_at").defaultNow(),

  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Proposal = typeof proposals.$inferSelect;

export type NewProposal = typeof proposals.$inferInsert;