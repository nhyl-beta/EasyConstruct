// apps/api/src/modules/finance/material-prices/rules.ts: pure, no I/O.
//
// Reference cost ranges for the materials demo-seed-procurement.ts prices its purchase requests
// with. Shaped like reference_snapshots (the EstimationPro.ai-backed Decision-Support catalog):
// a low/typical/high band rather than a single point figure, mirroring how that live catalog
// presents a range instead of one number. Each entry's `source` says exactly where the band
// comes from:
//   - a real published index (DPWH's Construction Materials Price Data, a market-rate retail
//     guide) where one exists for this material, with the index's own figure as the typical
//     value and a labeled dealer-variance spread as low/high;
//   - an explicit "no current official index" note for materials no such index covers (tie
//     wire, nails, waterproofing membrane, decorative tile) — these stay priced from a typical
//     hardware-supplier quote with an estimated spread, rather than being presented as indexed
//     when they aren't.
// PPE (helmets, harnesses), equipment rental (pump, scaffolding) and transport (hauling) are
// not materials at all, so they are out of scope for this table entirely and stay as plan
// metadata in demo-seed-procurement.ts.
export interface MaterialPriceSeed {
  material: string;
  unit: string;
  lowPhp: number;
  typicalPhp: number;
  highPhp: number;
  category: string;
  source: string;
  sourceUrl?: string;
}

export const MATERIAL_PRICE_SEEDS: readonly MaterialPriceSeed[] = [
  {
    material: "Portland cement 40kg",
    unit: "bag",
    lowPhp: 196,
    typicalPhp: 213.05,
    highPhp: 230,
    category: "Materials",
    source: "DPWH Construction Materials Price Data (CMPD), Nov 2025 revision — typical; low/high an estimated ±8% dealer-variance band",
    sourceUrl: "https://mb.com.ph/2025/11/03/dpwh-slashes-construction-material-costs-eyes-60-b-in-savings",
  },
  {
    material: "3/4in gravel",
    unit: "cu.m",
    lowPhp: 600,
    typicalPhp: 649.93,
    highPhp: 700,
    category: "Materials",
    source: "DPWH Construction Materials Price Data (CMPD), Nov 2025 revision (Gravel Grade 1) — typical; low/high an estimated ±8% dealer-variance band",
    sourceUrl: "https://mb.com.ph/2025/11/03/dpwh-slashes-construction-material-costs-eyes-60-b-in-savings",
  },
  {
    material: "16mm rebar",
    unit: "ton",
    lowPhp: 37_000,
    typicalPhp: 40_000,
    highPhp: 47_000,
    category: "Materials",
    source: "Market range, Metro Manila retail (deformed bar, PSA Construction Materials Retail Price Index-tracked ₱37-47/kg)",
    sourceUrl: "https://aedoconstruction.com/blog/construction-material-price-trends-philippines-2026/",
  },
  {
    material: "CHB 6in",
    unit: "pc",
    lowPhp: 24,
    typicalPhp: 26,
    highPhp: 30,
    category: "Materials",
    source: "Market range, Metro Manila/Luzon retail (AEDO Construction 2026 Cost Guide, ₱24-30/pc)",
    sourceUrl: "https://aedoconstruction.com/blog/resources/construction-cost-guide-2026/",
  },
  {
    material: "Marine plywood 3/4in",
    unit: "sheet",
    lowPhp: 1_374,
    typicalPhp: 1_450,
    highPhp: 1_700,
    category: "Materials",
    source: "Market range, Metro Manila hardware retail (3/4in marine plywood, compiled ₱1,374-1,700/sheet)",
    sourceUrl: "https://www.accio.com/business/plywood-philippines",
  },
  {
    material: "Tie wire #16",
    unit: "roll",
    lowPhp: 1_890,
    typicalPhp: 2_100,
    highPhp: 2_310,
    category: "Materials",
    source: "Estimate - no current DPWH/DTI/PSA index for this item; typical hardware-supplier quote with an estimated ±10% band",
  },
  {
    material: "Common nails",
    unit: "kg",
    lowPhp: 85,
    typicalPhp: 95,
    highPhp: 105,
    category: "Materials",
    source: "Estimate - no current DPWH/DTI/PSA index for this item; typical hardware-supplier quote with an estimated ±10% band",
  },
  {
    material: "Torch-on membrane",
    unit: "roll",
    lowPhp: 1_665,
    typicalPhp: 1_850,
    highPhp: 2_035,
    category: "Materials",
    source: "Estimate - no current DPWH/DTI/PSA index for this item; typical hardware-supplier quote with an estimated ±10% band",
  },
  {
    material: "Ceramic tile 60x60",
    unit: "box",
    lowPhp: 700,
    typicalPhp: 780,
    highPhp: 860,
    category: "Materials",
    source: "Estimate - no current DPWH/DTI/PSA index for this item; typical hardware-supplier quote with an estimated ±10% band",
  },
];
