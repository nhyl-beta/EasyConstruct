import {
  integer,
  numeric,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeId: varchar("employee_id", { length: 20 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  initials: varchar("initials", { length: 5 }).notNull(),
  role: varchar("role", { length: 100 }).notNull(),
  department: varchar("department", { length: 100 }).notNull(),
  site: varchar("site", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("Active"),
  attendanceRate: integer("attendance_rate").notNull().default(100),
  performance: numeric("performance", { precision: 3, scale: 1 }).notNull().default("4.0"),
  hiredOn: varchar("hired_on", { length: 20 }).notNull(),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 30 }),
  payRate: numeric("pay_rate", { precision: 12, scale: 2 }).notNull().default("0"),
  rateType: varchar("rate_type", { length: 20 }).notNull().default("Monthly"),
  // ── Added: real FK closing the user↔employee gap ──
  userId: integer("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;