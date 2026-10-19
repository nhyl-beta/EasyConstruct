// apps/api/src/scripts/backfill-reference-data.ts (objectives fix 1.2)
//
// Derives the shared clients and vendors tables from the free text already in
// the database, and links projects to their client. Safe to run on live data:
//   * DRY RUN by default. It prints what it would do and writes nothing.
//     Add --apply to write.
//   * IDEMPOTENT. Names already present (by normalized key) are skipped, and a
//     project is only linked when its client_id is empty.
//   * NEVER ALTERS existing values: projects.client, expenses.vendor,
//     procurement_orders.vendor and purchase_requests.preferred_vendor are
//     read, not changed.
//
//   npm --prefix server run db:backfill-reference            (dry run)
//   npm --prefix server run db:backfill-reference -- --apply (write)
import "dotenv/config";
import { isNull, sql } from "drizzle-orm";
import { db } from "../core/db/connection.js";
import { expenses, procurementOrders, purchaseRequests } from "../core/db/schema/finance.js";
import { projects } from "../core/db/schema/projects.js";
import { clients, vendors } from "../core/db/schema/reference.js";
import { normalizeName } from "../reference/names.js";
import { planBackfill, type BackfillPlan } from "../reference/backfill.js";

const APPLY = process.argv.includes("--apply");

const show = (label: string, plan: BackfillPlan) => {
  console.log(`\n${label}: ${plan.toCreate.length} to create, ${plan.alreadyPresent} already present, ${plan.skippedBlank} blank skipped`);
  for (const e of plan.toCreate) {
    console.log(`  + ${e.name}  (${e.occurrences} use${e.occurrences === 1 ? "" : "s"}${e.variants.length ? `, also seen as: ${e.variants.join(" | ")}` : ""})`);
  }
};

async function main() {
  console.log(APPLY ? "APPLY mode: writing." : "DRY RUN: nothing will be written. Add --apply to write.");

  const [clientValues, existingClients, vendorValues, existingVendors] = await Promise.all([
    db.select({ v: projects.client }).from(projects),
    db.select({ key: clients.nameKey }).from(clients),
    Promise.all([
      db.select({ v: expenses.vendor }).from(expenses),
      db.select({ v: procurementOrders.vendor }).from(procurementOrders),
      db.select({ v: purchaseRequests.preferredVendor }).from(purchaseRequests),
    ]),
    db.select({ key: vendors.nameKey }).from(vendors),
  ]);

  const clientPlan = planBackfill(clientValues.map((r) => r.v), new Set(existingClients.map((r) => r.key)));
  const vendorPlan = planBackfill(vendorValues.flat().map((r) => r.v), new Set(existingVendors.map((r) => r.key)));
  show("Clients (from projects.client)", clientPlan);
  show("Vendors (from expenses, procurement orders, purchase requests)", vendorPlan);

  if (!APPLY) {
    console.log("\nDry run finished. Nothing was written.");
    process.exit(0);
  }

  for (const e of clientPlan.toCreate) {
    await db.insert(clients).values({ name: e.name, nameKey: e.nameKey, createdBy: "backfill" }).onConflictDoNothing();
  }
  for (const e of vendorPlan.toCreate) {
    await db.insert(vendors).values({ name: e.name, nameKey: e.nameKey, createdBy: "backfill" }).onConflictDoNothing();
  }

  // Link projects whose client_id is empty to the client their text names.
  const all = await db.select({ id: clients.id, key: clients.nameKey }).from(clients);
  const idByKey = new Map(all.map((c) => [c.key, c.id]));
  const unlinked = await db.select({ id: projects.id, client: projects.client }).from(projects).where(isNull(projects.clientId));
  let linked = 0;
  for (const p of unlinked) {
    const clientId = p.client ? idByKey.get(normalizeName(p.client)) : undefined;
    if (clientId == null) continue;
    // The guard on client_id IS NULL keeps a re-run from touching an already linked project.
    await db.update(projects).set({ clientId }).where(sql`${projects.id} = ${p.id} AND ${projects.clientId} IS NULL`);
    linked += 1;
  }
  console.log(`\nLinked ${linked} of ${unlinked.length} unlinked projects to a client. Existing text values were not changed.`);
  console.log(`Done. ${clientPlan.toCreate.length} clients and ${vendorPlan.toCreate.length} vendors created.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
