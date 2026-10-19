import { date, integer, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  documentId: varchar("document_id", { length: 20 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  project: varchar("project", { length: 50 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  version: varchar("version", { length: 10 }).notNull().default("v1"),
  size: varchar("size", { length: 20 }),
  uploadedBy: varchar("uploaded_by", { length: 100 }).notNull(),
  fileUrl: varchar("file_url", { length: 500 }),
  // H1: which lifecycle stage (apps/api/src/lifecycle/phases.ts PROJECT_PHASES,
  // e.g. "Design") this document belongs to. Nullable so every document that
  // predates this column, or was never filed against a specific stage,
  // keeps working unfiltered.
  stage: varchar("stage", { length: 50 }),
  // I: an advisory document can be tied to the proposal or design it was
  // written about. Both nullable (and always set together); the related item
  // must belong to the same project — enforced in documents/service.ts.
  relatedType: varchar("related_type", { length: 20 }),
  relatedId: integer("related_id"),
  // PM reports (client demo change #10): which period a Daily / Weekly / Monthly Report covers, and the day it
  // starts (the day itself, that week's Monday, or the month's first day). Null on every other document.
  reportPeriod: varchar("report_period", { length: 10 }),
  periodDate: date("period_date", { mode: "string" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
