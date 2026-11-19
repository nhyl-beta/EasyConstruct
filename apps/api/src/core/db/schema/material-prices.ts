import { numeric, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

// Reference costs for construction materials, kept as data (editable without a code change)
// instead of hardcoded literals in demo-seed-procurement.ts. Shaped like reference_snapshots
// (the EstimationPro.ai-backed Decision-Support catalog) -- a low/typical/high range plus a
// fetchedAt cache timestamp -- but kept local/offline so demo:seed never depends on a live API.
// Each row cites where its range comes from in `source` (a real index where one exists,
// otherwise a labeled market estimate). See seed-material-prices.ts.
export const materialPrices = pgTable("material_price_references", {
  id: serial("id").primaryKey(),
  material: varchar("material", { length: 100 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  lowPhp: numeric("low_php", { precision: 12, scale: 2 }).notNull(),
  typicalPhp: numeric("typical_php", { precision: 12, scale: 2 }).notNull(),
  highPhp: numeric("high_php", { precision: 12, scale: 2 }).notNull(),
  category: varchar("category", { length: 50 }).notNull().default("Materials"),
  source: varchar("source", { length: 255 }).notNull(),
  sourceUrl: varchar("source_url", { length: 500 }),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MaterialPrice = typeof materialPrices.$inferSelect;
