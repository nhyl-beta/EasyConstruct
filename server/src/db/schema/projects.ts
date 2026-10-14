// server/src/db/schema/projects.ts — PATCHED (add geofence columns; rest unchanged)
import {
  pgTable, serial, varchar,
  integer, text, timestamp, numeric, jsonb,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { clients } from './reference.js';

export const projects = pgTable('projects', {
  id:          serial('id').primaryKey(),
  name:        varchar('name',        { length: 255 }).notNull(),
  code:        varchar('code',        { length: 50  }).notNull().unique(),
  pm:          varchar('pm',          { length: 100 }).notNull(),
  status:      varchar('status',      { length: 50  }).notNull().default('Planning'),
  statusTone:  varchar('status_tone', { length: 50  }).notNull().default('muted'),
  progress:    integer('progress').notNull().default(0),
  // Budget UTILISATION, as a percentage (0-100+). The contract amount lives
  // in contractValue — see ensure-demo-schema.ts.
  budget:      integer('budget').notNull().default(0),
  contractValue: numeric('contract_value', { precision: 14, scale: 2 }),
  due:         varchar('due',         { length: 20  }).notNull(),
  risk:        varchar('risk',        { length: 20  }).notNull().default('Low'),
  location:    varchar('location',    { length: 255 }),
  client:      varchar('client',      { length: 255 }),
  // Objectives fix 1.2: link to the shared clients table. Nullable; the text above
  // stays authoritative for older rows and is kept in step when a link is set.
  clientId:    integer('client_id').references(() => clients.id),
  // ISO 4217 code the project's amounts (contractValue, budgets, expenses)
  // are denominated in. Defaults to PHP because that is what every existing
  // row was implicitly stored in before this column existed.
  currency:    varchar('currency',    { length: 3   }).notNull().default('PHP'),
  workforce:   integer('workforce').default(0),
  description: text('description'),
  // Collected by the New Project wizard; until these columns existed the form
  // accepted the values and the API silently dropped them (Bug-008).
  projectType:      varchar('project_type', { length: 50 }),
  plannedStartDate: varchar('planned_start_date', { length: 20 }),
  scopeSummary:     text('scope_summary'),

  // What the engagement delivers, separate from the building projectType:
  // 'Construction' (the full path through site works) or 'Design' (plan sets
  // only: Proposal -> Design -> Turnover). See lifecycle/delivery.ts.
  deliveryType:     varchar('delivery_type', { length: 20 }).notNull().default('Construction'),
  // Disciplines chosen at creation for a Design project; Advance (Proposal ->
  // Design) turns each into a plan set (project_deliverables).
  designDisciplines: jsonb('design_disciplines').$type<string[]>().notNull().default([]),
  
  // ── Added for Site Personnel geofenced attendance ──
  siteLatitude:     numeric('site_latitude', { precision: 10, scale: 7 }),
  siteLongitude:    numeric('site_longitude', { precision: 10, scale: 7 }),
  geofenceRadiusM:  integer('geofence_radius_m').default(300),

  // ── Added for the project lifecycle (see lifecycle/phases.ts) ──
  // The phase Hold restores on Resume — only ever set by Hold, only ever
  // read by Resume.
  previousStatus:  varchar('previous_status', { length: 50 }),
  holdReason:      text('hold_reason'),
  completedAt:     timestamp('completed_at'),
  archivedAt:      timestamp('archived_at'),
  // Nullable: `pm` (the display name column above) is authoritative until
  // backfilled/set. Advance's "is this caller the project's own PM" check
  // falls back to name-matching while this is null — see
  // lifecycle/service.ts assertCanAdvance.
  pmUserId:        integer('pm_user_id').references(() => users.id),

  createdAt:   timestamp('created_at').defaultNow(),
  updatedAt:   timestamp('updated_at').defaultNow(),
});

export type Project    = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;