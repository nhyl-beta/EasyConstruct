import { boolean, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull(),
  // Account deactivation is IT Designer's "deactivate accounts" scope. Kept as
  // a flag rather than a delete so audit history and FK references (employees,
  // project_members, workflows.createdBy) stay intact. Login rejects `false`.
  isActive: boolean("is_active").notNull().default(true),
  // Bumped whenever the password changes. Session tokens issued before this
  // instant are rejected (middleware/auth.ts), so a reset signs out whoever
  // was using the old password.
  passwordChangedAt: timestamp("password_changed_at"),
  // Sessions issued before this instant are rejected (middleware/auth.ts). Set by sign-out,
  // a password change and deactivation.
  tokensValidAfter: timestamp("tokens_valid_after"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
