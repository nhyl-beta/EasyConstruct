// Builds a FRESH database: the schema, the reference data and the migration bookkeeping, in one command.
//
//   npm --prefix server run db:bootstrap -- --dry-run   show what it would do, change nothing
//   npm --prefix server run db:bootstrap -- --yes       do it
//
// ONLY for an empty database (a new server). It refuses when public.projects exists or the migration table has rows,
// so it can never be run against Neon or any database that is already in use. After it, `db:migrate` reports
// "Nothing to apply" and every later change goes through db:migrate as usual.
//
// What it does, in order:
//   1. builds the schema from the Drizzle schema (the same diff drizzle-kit push uses, run non-interactively);
//   2. creates the sequences and indexes that the migrations make but the Drizzle schema does not describe;
//   3. inserts the reference data the migrations insert (idempotent: expense categories, document types, the
//      "Design Turnover" workflow template), taking the INSERT statements from the migration files themselves;
//   4. records every migration in drizzle.__drizzle_migrations with the same hash and timestamp migrate.ts writes.
import "dotenv/config";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { bootstrapRefusal, dataSteps, extraSql, journalRows, realSchemaDifferences, unclassifiedDataMigrations } from "../db/bootstrap.js";
import { checkJournal, loadMigrations } from "../db/migrations.js";
import { compareWithSchema } from "./db-schema-tools.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const yes = args.includes("--yes");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const problems = checkJournal(drizzleDir);
  if (problems.length > 0) throw new Error("Migration journal is inconsistent:\n" + problems.map((p) => `  - ${p}`).join("\n"));
  const migrations = loadMigrations(drizzleDir);
  const unclassified = unclassifiedDataMigrations(migrations);
  if (unclassified.length > 0) throw new Error(`These migrations change rows but are not listed in DATA_MIGRATIONS (src/db/bootstrap.ts): ${unclassified.join(", ")}`);

  const url = new URL(process.env.DATABASE_URL);
  console.log(`Target database: ${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`);

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const projectsTableExists = (await client.query(`SELECT to_regclass('public.projects') AS t`)).rows[0].t !== null;
    const journalExists = (await client.query(`SELECT to_regclass('drizzle.__drizzle_migrations') AS t`)).rows[0].t !== null;
    const recordedMigrations = journalExists ? Number((await client.query(`SELECT count(*) AS n FROM drizzle.__drizzle_migrations`)).rows[0].n) : 0;
    const refusal = bootstrapRefusal({ projectsTableExists, recordedMigrations });
    if (refusal) {
      console.error(`REFUSED: ${refusal}`);
      process.exit(1);
    }

    const schema = await compareWithSchema(process.env.DATABASE_URL);
    const inserts = dataSteps(migrations);
    const rows = journalRows(migrations);
    const statements = schema.statements.filter((s) => !/ROW LEVEL SECURITY/i.test(s));
    console.log(`The database is empty. The bootstrap would:`);
    console.log(`  1. build the schema from the Drizzle schema (${statements.length} statements)`);
    console.log(`  2. create ${extraSql().length} sequences and indexes that only the migrations define`);
    console.log(`  3. insert reference data (${inserts.length} statements from ${[...new Set(inserts.map((i) => i.tag))].join(", ")})`);
    console.log(`  4. record ${rows.length} migrations as applied (${rows[0]!.tag} to ${rows[rows.length - 1]!.tag})`);
    if (dryRun || !yes) {
      await schema.close();
      console.log(dryRun ? "Dry run: nothing was changed." : "Nothing was changed. Run again with --yes to do it.");
      return;
    }

    await client.query("SELECT pg_advisory_lock(727002)");
    await schema.apply();
    await schema.close();
    console.log("  schema built");

    await client.query("BEGIN");
    try {
      for (const sql of extraSql()) await client.query(sql);
      for (const step of inserts) await client.query(step.sql);
      await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
      await client.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`);
      for (const r of rows) await client.query(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`, [r.hash, r.createdAt]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
    console.log(`  extras, reference data and ${rows.length} journal rows written`);

    const after = await compareWithSchema(process.env.DATABASE_URL);
    const left = realSchemaDifferences(after.statements);
    await after.close();
    const counts = (await client.query(`SELECT (SELECT count(*) FROM expense_categories) AS categories, (SELECT count(*) FROM document_types) AS doc_types, (SELECT count(*) FROM workflow_templates) AS templates`)).rows[0];
    console.log(`Done. Reference data: ${counts.categories} expense categories, ${counts.doc_types} document types, ${counts.templates} workflow template(s).`);
    console.log(left.length === 0 ? "The schema matches the Drizzle schema." : `WARNING: ${left.length} difference(s) remain:\n${left.map((s) => `  ${s}`).join("\n")}`);
    console.log("Next: npm --prefix server run db:migrate  (should say Nothing to apply), then db:seed for demo data if you want it.");
    if (left.length > 0) process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
