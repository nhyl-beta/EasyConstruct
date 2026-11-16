import { index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { employees } from "./employees.js";

// Files HR keeps on an employee: resume, certificates, CV, ID, contract (migration 0050). The file itself is in
// the uploads store; this row holds its link and label.
export const EMPLOYEE_DOCUMENT_TYPES = ["resume", "cv", "certificate", "id", "contract", "other"] as const;

export const employeeDocuments = pgTable(
  "employee_documents",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    docType: varchar("doc_type", { length: 20 }).notNull().default("other"),
    name: varchar("name", { length: 255 }).notNull(),
    url: text("url").notNull(),
    uploadedBy: varchar("uploaded_by", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("employee_documents_employee_idx").on(t.employeeId, t.createdAt)],
);

export type EmployeeDocument = typeof employeeDocuments.$inferSelect;
