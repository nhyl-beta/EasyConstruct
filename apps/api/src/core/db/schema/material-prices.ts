import { date, numeric, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

// Reference unit costs for construction materials, kept as data (editable without a code
// change) instead of hardcoded literals in demo-seed-procurement.ts. Each row cites where its
// price comes from (DPWH's Construction Materials Price Data where one exists, otherwise a
// labeled market estimate) and the date that price was as of. See seed-material-prices.ts.
export const materialPrices = pgTable("material_price_references", {
  id: serial("id").primaryKey(),
  material: varchar("material", { length: 100 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
  category: varchar("category", { length: 50 }).notNull().default("Materials"),
  source: varchar("source", { length: 255 }).notNull(),
  sourceUrl: varchar("source_url", { length: 500 }),
  asOfDate: date("as_of_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MaterialPrice = typeof materialPrices.$inferSelect;
