import { assertDemoEnvironment } from "./demo-guard.js";
assertDemoEnvironment();

// apps/api/scripts/demo/demo-employees.ts
//
// Idempotent roster upsert (npm run demo:employees): makes sure the 50
// deterministic roster employees (including the four named people) exist, never
// touching an account-linked row. `npm run demo:reset` already does this inside
// its transaction; this entry point is for re-running it on its own.
import "dotenv/config";
import pg from "pg";
import { assertDemoDatabase } from "./demo-guard.js";
import { upsertRoster } from "./demo-roster.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  assertDemoDatabase();
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const n = await upsertRoster(c);
    await c.query("COMMIT");
    const total = (await c.query("SELECT count(*)::int n FROM employees")).rows[0].n;
    const linked = (await c.query("SELECT count(*)::int n FROM employees WHERE user_id IS NOT NULL")).rows[0].n;
    console.log(`Upserted ${n} roster employees; employees total = ${total} (${linked} account-linked).`);
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
