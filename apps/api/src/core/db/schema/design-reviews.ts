import { pgTable, serial, varchar, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { designs } from './designs.js';

export const designReviews = pgTable('design_reviews', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  designId: integer('design_id').notNull().references(() => designs.id),
  discipline: varchar('discipline', { length: 50 }),
  priority: varchar('priority', { length: 20 }).notNull().default('Medium'),
  reviewers: text('reviewers'), // comma-separated names — no join table yet
  requestedBy: varchar('requested_by', { length: 100 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('Pending'),
  submittedAt: timestamp('submitted_at').defaultNow(),
  dueDate: varchar('due_date', { length: 20 }),
  completedAt: timestamp('completed_at'),
});

export type DesignReview = typeof designReviews.$inferSelect;
export type NewDesignReview = typeof designReviews.$inferInsert;