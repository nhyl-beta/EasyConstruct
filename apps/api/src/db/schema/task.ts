// apps/api/src/db/schema/task.ts — NEW
import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  taskCode: varchar("task_code", { length: 20 }).notNull().unique(),
  projectCode: varchar("project_code", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  priority: varchar("priority", { length: 20 }).notNull().default("Medium"), // Low | Medium | High
  status: varchar("status", { length: 20 }).notNull().default("Pending"),    // Pending | In Progress | Completed
  progress: integer("progress").notNull().default(0),
  dueDate: varchar("due_date", { length: 20 }),
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id),
  assignedToName: varchar("assigned_to_name", { length: 100 }), // denormalized display fallback
  // Completion evidence. A status flip alone recorded that work finished but
  // nothing about what was done, so field work could not be reviewed after
  // the fact; the note is required when moving to Completed, the attachment
  // is optional (see tasks/service.ts updateStatus).
  completionNote: text("completion_note"),
  completionFileUrl: varchar("completion_file_url", { length: 500 }),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;