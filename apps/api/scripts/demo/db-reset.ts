import { assertDemoEnvironment } from "./demo-guard.js";
assertDemoEnvironment();

// apps/api/scripts/demo/db-reset.ts
//
// Demo/dev data reset — NOT a production migration. Empties every table in
// the public schema (TRUNCATE ... RESTART IDENTITY CASCADE, so foreign keys
// and serial ids don't need to be dropped/recreated in dependency order) and
// leaves the schema itself untouched, so `npm run db:seed` (ensure-demo-schema
// + seed-demo-accounts) has a known-empty database to seed into. Idempotent:
// truncating an already-empty table is a no-op, so this is safe to run
// repeatedly.
import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_DB_RESET) {
    throw new Error(
      "Refusing to reset the database with NODE_ENV=production. This script " +
        "is for demo/development data only — set ALLOW_DB_RESET=1 if you " +
        "really mean it.",
    );
  }

  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );

  if (rows.length === 0) {
    console.log("No tables found in the public schema — nothing to reset.");
    return;
  }

  const tableList = rows.map((r) => `"${r.tablename}"`).join(", ");
  await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);

  console.log(`Reset ${rows.length} table(s) to empty:`);
  for (const { tablename } of rows) console.log(`  ${tablename}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
