// server/src/db/schema/document-types.ts (client demo change #1)
//
// The document types people can file a document under, editable by Admin and IT
// Designer. `documents.type` stays a plain varchar(50) holding the type NAME, so
// documents filed before this table existed keep working whatever their type is.
// `name_key` is the normalized name (document-types/rules.ts) and is unique.
// `is_system` marks the types the lifecycle gates read by exact name; those can be
// neither renamed nor deactivated.
import { boolean, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const documentTypes = pgTable("document_types", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  nameKey: varchar("name_key", { length: 50 }).notNull().unique(),
  category: varchar("category", { length: 50 }).notNull().default("General"),
  isSystem: boolean("is_system").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DocumentType = typeof documentTypes.$inferSelect;
