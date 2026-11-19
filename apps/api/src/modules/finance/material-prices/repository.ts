import { asc } from "drizzle-orm";
import { db } from "../../../core/db/connection.js";
import { materialPrices, type MaterialPrice } from "../../../core/db/schema/material-prices.js";
import { MATERIAL_PRICE_SEEDS } from "./rules.js";

export const findAll = (): Promise<MaterialPrice[]> => db.select().from(materialPrices).orderBy(asc(materialPrices.category), asc(materialPrices.material));

/** Current typical cost per `"material|unit" -> number`, for demo-seed-procurement.ts to price its lines from (the midpoint of each row's low/typical/high band). */
export const unitCostMap = async (): Promise<Map<string, number>> => {
  const rows = await findAll();
  return new Map(rows.map((r) => [`${r.material}|${r.unit}`, Number(r.typicalPhp)]));
};

/** Idempotent: adds any seed row that is missing (by its material+unit pair) and never touches an existing one. */
export const seedMissing = async (): Promise<number> => {
  let added = 0;
  for (const s of MATERIAL_PRICE_SEEDS) {
    const [row] = await db
      .insert(materialPrices)
      .values({
        material: s.material,
        unit: s.unit,
        lowPhp: s.lowPhp.toFixed(2),
        typicalPhp: s.typicalPhp.toFixed(2),
        highPhp: s.highPhp.toFixed(2),
        category: s.category,
        source: s.source,
        sourceUrl: s.sourceUrl,
      })
      .onConflictDoNothing()
      .returning();
    if (row) added++;
  }
  return added;
};
