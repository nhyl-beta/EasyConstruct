import {
  pgTable, serial, varchar,
  integer, text, timestamp, jsonb, boolean,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const designs = pgTable('designs', {
  id:             serial('id').primaryKey(),
  code:           varchar('code',            { length: 50  }).notNull().unique(),
  name:           varchar('name',            { length: 255 }).notNull(),
  projectCode:    varchar('project_code',    { length: 50  }).notNull(), // free-text, mirrors projects.code / proposals.projectCode convention
  discipline:     varchar('discipline',      { length: 50  }).notNull(),
  category:       varchar('category',        { length: 50  }).notNull(),
  phase:          varchar('phase',           { length: 50  }).notNull().default('Design Development'),
  version:        varchar('version',         { length: 20  }).notNull().default('v0.1'),
  revision:       integer('revision').notNull().default(0),
  status:         varchar('status',          { length: 50  }).notNull().default('Draft'),
  leadArchitect:  varchar('lead_architect',  { length: 100 }).notNull(),
  client:         varchar('client',          { length: 255 }),
  building:       varchar('building',        { length: 100 }),
  floor:          varchar('floor',           { length: 50  }),
  zone:           varchar('zone',            { length: 50  }),
  description:    text('description'),
  fileCount:      integer('file_count').notNull().default(0),
  fileUrls:       jsonb('file_urls').$type<Array<{ name: string; url: string }>>().notNull().default([]),
  assignedEngineerId:   integer('assigned_engineer_id').references(() => users.id),
  assignedEngineerName: varchar('assigned_engineer_name', { length: 100 }),
  aiCompleteness: integer('ai_completeness').notNull().default(0),
  aiConfidence:   integer('ai_confidence').notNull().default(0),
  // True for the placeholder design created by the demo-revisions generator.
  isDemo:         boolean('is_demo').notNull().default(false),
  createdAt:      timestamp('created_at').defaultNow(),
  updatedAt:      timestamp('updated_at').defaultNow(),
});

export type Design    = typeof designs.$inferSelect;
export type NewDesign = typeof designs.$inferInsert;