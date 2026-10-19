// apps/api/src/scripts/demo-sql.ts
//
// Tiny READ-ONLY SQL runner for evidence gathering: `npx tsx src/scripts/demo-sql.ts "select ..." ["select ..."]`.
// Runs every statement inside a READ ONLY transaction, so it cannot change data.
import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    for (const sql of process.argv.slice(2)) {
      console.log(`\n> ${sql}`);
      const r = await client.query(sql);
      console.table(r.rows);
    }
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
