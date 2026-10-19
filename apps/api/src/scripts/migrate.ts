// Applies the SQL migrations in server/drizzle that the database has not recorded.
//
//   npm --prefix server run db:migrate                 apply what is pending, print what ran
//   npm --prefix server run db:migrate -- --dry-run    list what would run, change nothing
//   npm --prefix server run db:migrate -- --print-sql  print the SQL of every migration after
//                                                      the baseline (0026); needs no database
//   npm --prefix server run db:migrate -- --baseline-through=0026_expense_categories
//                                                      record older migrations as applied
//                                                      without running them (see below)
//
// It uses the same bookkeeping table as drizzle-kit (drizzle.__drizzle_migrations, same
// hash and timestamp). Unlike drizzle-kit it decides by hash, not by "newer than the latest
// recorded timestamp", and it always prints the outcome, including "nothing to apply".
//
// Baseline: the early migrations (0000 to 0026) are plain CREATE TABLE and cannot run on a
// database that was built another way. When the bookkeeping table is empty but the schema
// already exists, this refuses and asks for --baseline-through. That only writes bookkeeping
// rows; it never runs the old SQL.
import "dotenv/config";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { checkJournal, loadMigrations, planMigrations } from "../db/migrations.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function main() {
  const problems = checkJournal(drizzleDir);
  if (problems.length > 0) {
    console.error("Migration journal is inconsistent:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  const all = loadMigrations(drizzleDir);

  if (flag("print-sql")) {
    for (const m of all.filter((x) => x.idx >= 27)) console.log(`-- ===== ${m.tag} =====\n${m.sql.trim()}\n`);
    return;
  }

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const host = new URL(process.env.DATABASE_URL).hostname;
  console.log(`Target database host: ${host}`);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const dryRun = flag("dry-run");
    await client.query("SELECT pg_advisory_lock(727001)");
    if (!dryRun) {
      await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
      await client.query(
        `CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
      );
    }
    const tableExists = (await client.query(`SELECT to_regclass('drizzle.__drizzle_migrations') AS t`)).rows[0].t !== null;
    const recorded = new Set<string>(
      tableExists ? (await client.query(`SELECT hash FROM drizzle.__drizzle_migrations`)).rows.map((r) => r.hash as string) : [],
    );
    const schemaExists = (await client.query(`SELECT to_regclass('public.projects') AS t`)).rows[0].t !== null;

    const baselineTag = option("baseline-through");
    if (recorded.size === 0 && schemaExists && !baselineTag) {
      console.error(
        "The migration table is empty but the schema already exists, so migrations 0000 onward cannot be run.\n" +
          "If the older migrations were applied another way, record them as done first:\n" +
          "  npm --prefix server run db:migrate -- --baseline-through=0026_expense_categories\n" +
          "(writes bookkeeping rows only), then run db:migrate again.",
      );
      process.exit(1);
    }
    if (baselineTag) {
      const upTo = all.find((m) => m.tag === baselineTag);
      if (!upTo) throw new Error(`Unknown migration ${baselineTag}`);
      const toRecord = all.filter((m) => m.idx <= upTo.idx && !recorded.has(m.hash));
      console.log(`${dryRun ? "Would record" : "Recording"} ${toRecord.length} older migration(s) as already applied (SQL not run).`);
      if (!dryRun) {
        for (const m of toRecord) {
          await client.query(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`, [m.hash, m.when]);
          recorded.add(m.hash);
        }
      } else toRecord.forEach((m) => recorded.add(m.hash));
    }

    const plan = planMigrations(all, recorded);
    if (plan.pending.length === 0) {
      console.log(`Nothing to apply. ${plan.alreadyApplied} of ${all.length} migrations are already recorded.`);
      return;
    }
    console.log(`${dryRun ? "Would apply" : "Applying"} ${plan.pending.length} migration(s): ${plan.pending.map((m) => m.tag).join(", ")}`);
    if (dryRun) return;

    for (const m of plan.pending) {
      await client.query("BEGIN");
      try {
        for (const statement of m.statements) await client.query(statement);
        await client.query(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`, [m.hash, m.when]);
        await client.query("COMMIT");
        console.log(`  applied ${m.tag}`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`  FAILED ${m.tag}: ${(err as Error).message}. It was rolled back; nothing after it ran.`);
        process.exit(1);
      }
    }
    console.log(`Done. Applied ${plan.pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
