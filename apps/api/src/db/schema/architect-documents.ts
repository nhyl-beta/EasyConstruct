import { pgTable, serial, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { designs } from './designs.js';

export const architectDocuments = pgTable('architect_documents', {
  id: serial('id').primaryKey(),
  designId: integer('design_id').references(() => designs.id),
  // Set for plans/drawings tracked in the Revisions page that belong to a
  // project without a design. Nullable: older rows reach their project via designId.
  projectCode: varchar('project_code', { length: 50 }),
  title: varchar('title', { length: 255 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  version: varchar('version', { length: 20 }).notNull().default('v1.0'),
  owner: varchar('owner', { length: 100 }).notNull(),
  fileType: varchar('file_type', { length: 20 }).notNull().default('PDF'),
  sizeKb: integer('size_kb').notNull().default(0),
  status: varchar('status', { length: 50 }).notNull().default('Draft'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export type ArchitectDocument = typeof architectDocuments.$inferSelect;
export type NewArchitectDocument = typeof architectDocuments.$inferInsert;