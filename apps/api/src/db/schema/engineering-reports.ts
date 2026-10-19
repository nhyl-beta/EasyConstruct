import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const engineeringReports = pgTable("engineering_reports", {
  id: serial("id").primaryKey(),
  reportId: varchar("report_id", { length: 20 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(),
  project: varchar("project", { length: 50 }).notNull(),
  location: varchar("location", { length: 255 }).notNull(),
  date: varchar("date", { length: 20 }).notNull(),
  engineer: varchar("engineer", { length: 100 }).notNull(),
  priority: varchar("priority", { length: 20 }).notNull().default("Medium"),
  description: text("description").notNull(),
  findings: text("findings").notNull(),
  measurements: text("measurements"),
  observations: text("observations"),
  recommendations: text("recommendations").notNull(),
  requiredActions: text("required_actions"),
  status: varchar("status", { length: 30 }).notNull().default("Submitted"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type EngineeringReportRow = typeof engineeringReports.$inferSelect;
export type NewEngineeringReportRow = typeof engineeringReports.$inferInsert;