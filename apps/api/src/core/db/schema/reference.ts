// apps/api/src/db/schema/reference.ts (objectives fix 1.2)
//
// Shared reference data: one row per client and per vendor, so the same company
// is not typed three different ways. `name_key` is the normalized name
// (reference/names.ts) and is unique, which is what stops "ABC Steel Supply,
// Inc." and "abc steel supply" becoming two vendors. The free-text columns on
// projects (client), expenses and purchase requests (vendor) stay as they are;
// these tables sit beside them and are linked by id where a link exists.
import { pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  nameKey: varchar("name_key", { length: 255 }).notNull().unique(),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  nameKey: varchar("name_key", { length: 255 }).notNull().unique(),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
