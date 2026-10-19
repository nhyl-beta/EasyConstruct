// Read-only: compares a database with the Drizzle schema and exits 1 on any real difference.
//
//   npm --prefix server run db:verify-schema
//
// Uses drizzle-kit's own diff, minus the differences it always reports (see isKnownSchemaNoise in db/bootstrap.ts),
// and also checks the sequences and indexes that only the migrations create. Changes nothing.
import "dotenv/config";
import pg from "pg";
import { EXTRA_INDEXES, EXTRA_SEQUENCES, realSchemaDifferences } from "../core/db/bootstrap.js";
import { compareWithSchema } from "./db-schema-tools.js";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  const url = new URL(process.env.DATABASE_URL);
  console.log(`Target database: ${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`);

  const schema = await compareWithSchema(process.env.DATABASE_URL);
  const differences = realSchemaDifferences(schema.statements).map((s) => `schema: ${s}`);
  await schema.close();

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const sequences = new Set((await client.query(`SELECT sequencename FROM pg_sequences WHERE schemaname = 'public'`)).rows.map((r) => r.sequencename as string));
    for (const s of EXTRA_SEQUENCES) if (!sequences.has(s)) differences.push(`missing sequence ${s}`);
    const indexes = new Set((await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`)).rows.map((r) => r.indexname as string));
    for (const i of EXTRA_INDEXES) if (!indexes.has(i.name)) differences.push(`missing index ${i.name}`);
  } finally {
    await client.end();
  }

  if (differences.length === 0) {
    console.log("OK: the database matches the Drizzle schema.");
    return;
  }
  console.error(`${differences.length} difference(s):\n${differences.map((d) => `  ${d.slice(0, 200)}`).join("\n")}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
