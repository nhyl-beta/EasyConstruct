import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export interface WorkflowStageDefinition {
  role: string;
  roleLabel: string;
  iconKey: string;
}

export const workflowTemplates = pgTable("workflow_templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 500 }).notNull(),
  avgDurationHours: numeric("avg_duration_hours", {
    precision: 6,
    scale: 1,
  }).notNull(),
  defaultStages: jsonb("default_stages")
    .$type<WorkflowStageDefinition[]>()
    .notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const workflows = pgTable("workflows", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  projectCode: varchar("project_code", { length: 50 }).notNull(),
  templateId: integer("template_id").references(() => workflowTemplates.id),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  type: varchar("type", { length: 50 }),
  severity: varchar("severity", { length: 20 }).notNull().default("medium"),
  aiNote: varchar("ai_note", { length: 500 }),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  createdBy: varchar("created_by", { length: 100 }).notNull(),
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
  iconKey: varchar("icon_key", { length: 30 })
    .notNull()
    .default("UserCheck"),
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