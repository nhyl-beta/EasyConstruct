import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { budgets } from "./finance.js";
import { users } from "./users.js";

export interface WorkflowStageDefinition {
  role: string;
  roleLabel: string;
  iconKey: string;
}

export const workflowTemplates = pgTable("workflow_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  avgDurationHours: numeric("avg_duration_hours", { precision: 6, scale: 1 }).notNull(),
  defaultStages: jsonb("default_stages").$type<WorkflowStageDefinition[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const workflows = pgTable("workflows", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  projectCode: varchar("project_code", { length: 50 }).notNull(),
  templateId: integer("template_id").references(() => workflowTemplates.id),
  // G4: links a "Budget Change Request" workflow to the budget it targets, so
  // a final approval can sync budgets.planned + insert a budget_adjustments
  // row instead of the change living only in the workflow's line items.
  // Nullable — every other workflow template has no budget to link.
  budgetId: integer("budget_id").references(() => budgets.id),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  type: varchar("type", { length: 50 }),
  severity: varchar("severity", { length: 20 }).notNull().default("medium"),
  aiNote: varchar("ai_note", { length: 500 }),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  createdBy: varchar("created_by", { length: 100 }).notNull(),
  // J2: lets decideStage notify the initiator directly on the workflow's
  // outcome (rejected / final-approved) — createdBy is a denormalized
  // display name, not a usable recipient. Nullable so legacy rows (created
  // before this column existed) just don't get that notification.
  createdByUserId: integer("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workflowStages = pgTable("workflow_stages", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  role: varchar("role", { length: 40 }).notNull(),
  roleLabel: varchar("role_label", { length: 60 }).notNull(),
  iconKey: varchar("icon_key", { length: 30 }).notNull().default("UserCheck"),
  status: varchar("status", { length: 20 }).notNull().default("upcoming"),
  assignedTo: varchar("assigned_to", { length: 100 }),
  decidedBy: varchar("decided_by", { length: 100 }),
  decidedAt: timestamp("decided_at"),
  comments: varchar("comments", { length: 1000 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type WorkflowTemplateRow = typeof workflowTemplates.$inferSelect;
export type NewWorkflowTemplateRow = typeof workflowTemplates.$inferInsert;
export type WorkflowRow = typeof workflows.$inferSelect;
export type NewWorkflowRow = typeof workflows.$inferInsert;
export type WorkflowStageRow = typeof workflowStages.$inferSelect;
export type NewWorkflowStageRow = typeof workflowStages.$inferInsert;

// ── Attachments ────────────────────────────────────────────────────────────
// What was actually submitted at each stage of a workflow. Before this, a
// workflow carried only a title and an amount, so a Consultant, PM or Admin
// deciding at stage 2/3/4 could not see the design, justification or document
// the earlier stage was arguing from.
//
//   kind = "document" → an uploaded file (fileUrl/fileName/fileSize)
//   kind = "note"     → a written submission (content), e.g. an engineer's
//                       budget-change justification
//
// stageId is the stage it was filed against, and is nullable: attachments
// supplied at creation time are recorded before the submitter's own stage is
// known, and ON DELETE SET NULL keeps the attachment if a stage row goes.
export const WORKFLOW_ATTACHMENT_KINDS = ["document", "note"] as const;
export type WorkflowAttachmentKind = (typeof WORKFLOW_ATTACHMENT_KINDS)[number];

export const workflowAttachments = pgTable("workflow_attachments", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  stageId: integer("stage_id").references(() => workflowStages.id, {
    onDelete: "set null",
  }),
  kind: varchar("kind", { length: 20 }).notNull().default("document"),
  label: varchar("label", { length: 255 }).notNull(),
  content: text("content"),
  fileUrl: varchar("file_url", { length: 500 }),
  fileName: varchar("file_name", { length: 255 }),
  fileSize: varchar("file_size", { length: 20 }),
  uploadedBy: varchar("uploaded_by", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Line items ─────────────────────────────────────────────────────────────
// The materials / labour / other-cost changes behind a budget-change
// request's headline amount. Finance reviews the lines, not the total.
export const WORKFLOW_LINE_ITEM_CATEGORIES = [
  "materials",
  "labor",
  "equipment",
  "subcontractor",
  "other",
] as const;
export type WorkflowLineItemCategory =
  (typeof WORKFLOW_LINE_ITEM_CATEGORIES)[number];

export const workflowLineItems = pgTable("workflow_line_items", {
  id: serial("id").primaryKey(),
  workflowId: integer("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 30 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  currentAmount: numeric("current_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  requestedAmount: numeric("requested_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  // ai-signals B2: optional inputs for the decision-support cost comparison
  // (ai-validation/service.ts) — without both, a line is a "no-match" by
  // definition, never an error.
  quantity: numeric("quantity", { precision: 14, scale: 3 }),
  unit: varchar("unit", { length: 20 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export type WorkflowAttachmentRow = typeof workflowAttachments.$inferSelect;
export type NewWorkflowAttachmentRow = typeof workflowAttachments.$inferInsert;
export type WorkflowLineItemRow = typeof workflowLineItems.$inferSelect;
export type NewWorkflowLineItemRow = typeof workflowLineItems.$inferInsert;
