import {
  boolean,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  message: varchar("message", { length: 500 }),
  type: varchar("type", { length: 50 }).notNull().default("info"),
  // Role-addressed (every user with this role sees it) when recipientUserId
  // is null; a specific user's notification otherwise. The service's public
  // input shape (recipientRole/title/body/link) never changed — only how it
  // maps onto these columns, which previously didn't match the shape at all
  // (see ensure-demo-schema.ts for the migration note).
  role: varchar("role", { length: 50 }),
  recipientUserId: integer("recipient_user_id").references(() => users.id),
  projectCode: varchar("project_code", { length: 50 }),
  link: varchar("link", { length: 500 }),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
