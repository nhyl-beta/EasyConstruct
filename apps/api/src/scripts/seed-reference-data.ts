// apps/api/src/scripts/seed-reference-data.ts — NEW (ai-signals B5)
//
// Pulls the whole EstimationPro.ai catalog into reference_snapshots, once,
// within the daily request budget. Deliberately NOT part of db:seed —
// db:seed must work with no network access, and this script's job is
// exactly the opposite: reach the live API. Run it on its own:
//
//   npm run ai:seed-references
//
// Safe to re-run; every row is upserted on (source, source_item_id).
import "dotenv/config";
import { fetchTrades, fetchCostsForTrade } from "../ai-validation/reference-client.js";

async function main() {
  const trades = await fetchTrades();
  if (trades.length === 0) {
    console.error("No trades returned from EstimationPro.ai — check connectivity/quota. Nothing seeded.");
    process.exitCode = 1;
    return;
  }
  console.log(`Fetched ${trades.length} trades. Pulling cost items for each...`);

  let totalItems = 0;
  let failedTrades = 0;
  for (const trade of trades) {
    const rows = await fetchCostsForTrade(trade);
    if (rows.length === 0) {
      failedTrades += 1;
      console.warn(`  ${trade}: no items written (budget exhausted or request failed)`);
      continue;
    }
    totalItems += rows.length;
    console.log(`  ${trade}: ${rows.length} items`);
  }

  console.log(`\nDone. ${totalItems} reference items cached across ${trades.length - failedTrades}/${trades.length} trades.`);
  if (failedTrades > 0) {
    console.log(`${failedTrades} trade(s) were skipped — re-run this script later (e.g. tomorrow, once the daily budget resets) to fill them in.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
