// apps/api/src/modules/finance/material-prices/rules.ts: pure, no I/O.
//
// Reference unit costs for the materials demo-seed-procurement.ts prices its purchase
// requests with. Each entry's `source` says exactly where the number comes from:
//   - DPWH's Construction Materials Price Data (CMPD), the government's own cost reference
//     for infrastructure projects, where the material is one DPWH tracks and a current
//     figure was found;
//   - a named market/industry estimate where DPWH tracks the category but the exact size or
//     grade here isn't broken out in what's publicly published;
//   - an explicit "no current official index" note for materials DPWH's CMPD does not cover
//     (tie wire, nails, waterproofing membrane, decorative tile) — these stay priced from a
//     typical hardware-supplier quote rather than being presented as sourced when they aren't.
// PPE (helmets, harnesses), equipment rental (pump, scaffolding) and transport (hauling) are
// not materials at all, so they are out of scope for this table entirely and stay as plan
// metadata in demo-seed-procurement.ts.
export interface MaterialPriceSeed {
  material: string;
  unit: string;
  unitCost: number;
  category: string;
  source: string;
  sourceUrl?: string;
  asOfDate: string;
}

export const MATERIAL_PRICE_SEEDS: readonly MaterialPriceSeed[] = [
  {
    material: "Portland cement 40kg",
    unit: "bag",
    unitCost: 213.05,
    category: "Materials",
    source: "DPWH Construction Materials Price Data (CMPD), Nov 2025 revision",
    sourceUrl: "https://mb.com.ph/2025/11/03/dpwh-slashes-construction-material-costs-eyes-60-b-in-savings",
    asOfDate: "2025-11-03",
  },
  {
    material: "3/4in gravel",
    unit: "cu.m",
    unitCost: 649.93,
    category: "Materials",
    source: "DPWH Construction Materials Price Data (CMPD), Nov 2025 revision (Gravel Grade 1)",
    sourceUrl: "https://mb.com.ph/2025/11/03/dpwh-slashes-construction-material-costs-eyes-60-b-in-savings",
    asOfDate: "2025-11-03",
  },
  {
    material: "16mm rebar",
    unit: "ton",
    unitCost: 40_000,
    category: "Materials",
    source: "Market average, Metro Manila retail (deformed bar, PSA Construction Materials Retail Price Index-tracked range ₱37-47/kg)",
    sourceUrl: "https://aedoconstruction.com/blog/construction-material-price-trends-philippines-2026/",
    asOfDate: "2026-04-01",
  },
  {
    material: "CHB 6in",
    unit: "pc",
    unitCost: 26,
    category: "Materials",
    source: "Market average, Metro Manila/Luzon retail (AEDO Construction 2026 Cost Guide, ₱24-30/pc)",
    sourceUrl: "https://aedoconstruction.com/blog/resources/construction-cost-guide-2026/",
    asOfDate: "2026-05-01",
  },
  {
    material: "Marine plywood 3/4in",
    unit: "sheet",
    unitCost: 1_450,
    category: "Materials",
    source: "Market average, Metro Manila hardware retail (3/4in marine plywood, compiled range ₱1,374-1,700/sheet)",
    sourceUrl: "https://www.accio.com/business/plywood-philippines",
    asOfDate: "2026-04-01",
  },
  {
    material: "Tie wire #16",
    unit: "roll",
    unitCost: 2_100,
    category: "Materials",
    source: "Estimate - no current DPWH/DTI/PSA index for this item; priced per typical hardware-supplier quote",
    asOfDate: "2026-11-19",
  },
  {
    material: "Common nails",
    unit: "kg",
    unitCost: 95,
    category: "Materials",
    source: "Estimate - no current DPWH/DTI/PSA index for this item; priced per typical hardware-supplier quote",
    asOfDate: "2026-11-19",
  },
  {
    material: "Torch-on membrane",
    unit: "roll",
    unitCost: 1_850,
    category: "Materials",
    source: "Estimate - no current DPWH/DTI/PSA index for this item; priced per typical hardware-supplier quote",
    asOfDate: "2026-11-19",
  },
  {
    material: "Ceramic tile 60x60",
    unit: "box",
    unitCost: 780,
    category: "Materials",
    source: "Estimate - no current DPWH/DTI/PSA index for this item; priced per typical hardware-supplier quote",
    asOfDate: "2026-11-19",
  },
];
