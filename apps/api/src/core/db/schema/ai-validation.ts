// apps/api/src/db/schema/ai-validation.ts — NEW (ai-signals group B)
//
// Cached, cited cost-reference data (retrieve, don't generate — see
// docs/ai-signals-progress.md group B/C) and the persisted results of
// comparing a workflow line item's requested amount against it. Both tables
// are read-only inputs to the decision-support signal layer
// (apps/api/src/signals/*) — nothing here can block a gate or an approval.
import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { workflows } from "./workflows.js";

// ── Reference snapshots ──────────────────────────────────────────────────
// A cached copy of one EstimationPro.ai catalog item. Refreshed by
// reference-client.ts/cache.ts, never generated or edited by hand — every
// value here is exactly what the source reported, at the unit the source
// reported it in. Unit/currency conversion happens downstream in cost.ts,
// not by mutating these rows.
export const referenceSnapshots = pgTable(
  "reference_snapshots",
  {
    id: serial("id").primaryKey(),
    source: varchar("source", { length: 50 }).notNull().default("estimationpro"),
    sourceItemId: varchar("source_item_id", { length: 100 }).notNull(),
    trade: varchar("trade", { length: 50 }).notNull(),
    // text, not varchar(255): some EstimationPro.ai descriptions run past
    // 500 characters (found live while seeding — see Deviations AV-4).
    description: text("description").notNull(),
    unit: varchar("unit", { length: 30 }).notNull(),
    lowUsd: numeric("low_usd", { precision: 12, scale: 2 }).notNull(),
    typicalUsd: numeric("typical_usd", { precision: 12, scale: 2 }).notNull(),
    highUsd: numeric("high_usd", { precision: 12, scale: 2 }).notNull(),
    // The trade-level multiplier EstimationPro.ai returned alongside this
    // item's batch (AV-1 deviation: the live API reports this per trade
    // response, not per item — every row from the same fetch shares it).
    regionMultiplier: numeric("region_multiplier", { precision: 6, scale: 3 }),
    volatility: varchar("volatility", { length: 20 }),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    sourceUrl: varchar("source_url", { length: 500 }),
    rawPayload: jsonb("raw_payload"),
    fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
  },
  (table) => [unique("reference_snapshots_source_item_unique").on(table.source, table.sourceItemId)],
);

export type ReferenceSnapshotRow = typeof referenceSnapshots.$inferSelect;
export type NewReferenceSnapshotRow = typeof referenceSnapshots.$inferInsert;

// ── Validation results ───────────────────────────────────────────────────
// One row per workflow line item per validation run. "no-match" rows are
// kept, not discarded — basisSummary always states why, so the UI can show
// "No comparable reference" with a reason instead of silently showing
// nothing.
export const VALIDATION_VERDICTS = [
  "within-range",
  "above-typical",
  "below-typical",
  "no-match",
] as const;
export type ValidationVerdict = (typeof VALIDATION_VERDICTS)[number];

export const validationResults = pgTable("validation_results", {
  id: serial("id").primaryKey(),
  entityType: varchar("entity_type", { length: 30 }).notNull().default("workflow_line_item"),
  entityId: integer("entity_id").notNull(),
  workflowId: integer("workflow_id")
    .notNull()
    .references(() => workflows.id, { onDelete: "cascade" }),
  projectCode: varchar("project_code", { length: 50 }).notNull(),
  lineDescription: varchar("line_description", { length: 255 }).notNull(),
  lineQuantity: numeric("line_quantity", { precision: 14, scale: 3 }),
  lineUnit: varchar("line_unit", { length: 20 }),
  projectValuePhp: numeric("project_value_php", { precision: 14, scale: 2 }).notNull(),
  matchedSnapshotId: integer("matched_snapshot_id").references(() => referenceSnapshots.id, {
    onDelete: "set null",
  }),
  matchScore: numeric("match_score", { precision: 4, scale: 3 }),
  referenceUnit: varchar("reference_unit", { length: 30 }),
  unitFactor: numeric("unit_factor", { precision: 14, scale: 6 }),
  referenceLowUsd: numeric("reference_low_usd", { precision: 14, scale: 2 }),
  referenceMidUsd: numeric("reference_mid_usd", { precision: 14, scale: 2 }),
  referenceHighUsd: numeric("reference_high_usd", { precision: 14, scale: 2 }),
  referenceLowPhp: numeric("reference_low_php", { precision: 14, scale: 2 }),
  referenceMidPhp: numeric("reference_mid_php", { precision: 14, scale: 2 }),
  referenceHighPhp: numeric("reference_high_php", { precision: 14, scale: 2 }),
  fxRateUsed: numeric("fx_rate_used", { precision: 8, scale: 4 }).notNull(),
  fxRateAsOf: varchar("fx_rate_as_of", { length: 20 }).notNull(),
  variancePct: numeric("variance_pct", { precision: 8, scale: 4 }),
  verdict: varchar("verdict", { length: 20 }).notNull(),
  basisSummary: text("basis_summary").notNull(),
  sources: jsonb("sources"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ValidationResultRow = typeof validationResults.$inferSelect;
export type NewValidationResultRow = typeof validationResults.$inferInsert;
