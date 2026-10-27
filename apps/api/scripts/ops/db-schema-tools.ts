// Shared by db:bootstrap and db:verify-schema: compares a database with the Drizzle schema using drizzle-kit's own
// diff (drizzle-kit/api, a dev dependency), without applying anything unless apply() is called.
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

const schemaDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "core", "db", "schema");

/** Every schema file, as `drizzle-kit push` reads them (schema/index.ts only re-exports one of them). */
async function loadSchemaModules(): Promise<Record<string, unknown>> {
  const all: Record<string, unknown> = {};
  for (const file of readdirSync(schemaDir).filter((f) => f.endsWith(".ts") && f !== "index.ts")) {
    Object.assign(all, await import(`../../src/core/db/schema/${file.replace(/\.ts$/, ".js")}`));
  }
  return all;
}

export interface SchemaComparison {
  /** SQL drizzle-kit would run to make the database match the schema. */
  statements: string[];
  apply: () => Promise<void>;
  close: () => Promise<void>;
}

export async function compareWithSchema(databaseUrl: string): Promise<SchemaComparison> {
  const { pushSchema } = await import("drizzle-kit/api");
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const result = await pushSchema((await loadSchemaModules()) as never, drizzle(pool) as never);
  return {
    statements: result.statementsToExecute,
    apply: () => result.apply(),
    close: () => pool.end(),
  };
}
