import { asc } from "drizzle-orm";
import { db } from "../../../core/db/connection.js";
import { materialPrices, type MaterialPrice } from "../../../core/db/schema/material-prices.js";
import { MATERIAL_PRICE_SEEDS } from "./rules.js";

export const findAll = (): Promise<MaterialPrice[]> => db.select().from(materialPrices).orderBy(asc(materialPrices.category), asc(materialPrices.material));

/** All current unit costs as `"material|unit" -> number`, for demo-seed-procurement.ts to price its lines from. */
export const unitCostMap = async (): Promise<Map<string, number>> => {
  const rows = await findAll();
  return new Map(rows.map((r) => [`${r.material}|${r.unit}`, Number(r.unitCost)]));
};

/** Idempotent: adds any seed row that is missing (by its material+unit pair) and never touches an existing one. */
export const seedMissing = async (): Promise<number> => {
  let added = 0;
  for (const s of MATERIAL_PRICE_SEEDS) {
    const [row] = await db
      .insert(materialPrices)
      .values({ material: s.material, unit: s.unit, unitCost: s.unitCost.toFixed(2), category: s.category, source: s.source, sourceUrl: s.sourceUrl, asOfDate: s.asOfDate })
      .onConflictDoNothing()
      .returning();
    if (row) added++;
  }
  return added;
};
