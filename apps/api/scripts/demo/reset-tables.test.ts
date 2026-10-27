import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { ACCOUNT_TABLES, DELETE_ORDER, PRESERVE, SPECIAL, unclassifiedTables } from "./reset-tables.js";

const schemaDir = join(process.cwd(), "src", "core", "db", "schema");

/** Every table the Drizzle schema declares. */
const schemaTables = async (): Promise<PgTable[]> => {
  const out: PgTable[] = [];
  for (const file of readdirSync(schemaDir).filter((f) => f.endsWith(".ts") && f !== "index.ts")) {
    const mod = (await import(`../../src/core/db/schema/${file.replace(/\.ts$/, ".js")}`)) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      try {
        getTableConfig(value as PgTable);
        out.push(value as PgTable);
      } catch {
        // not a table (a type, an enum or a constant)
      }
    }
  }
  return out;
};

describe("demo:reset table classification", () => {
  test("every table in the Drizzle schema is classified, so a new table cannot make the reset refuse to run", async () => {
    const names = (await schemaTables()).map((t) => getTableConfig(t).name);
    assert.ok(names.length > 40, "the schema was not read");
    assert.deepEqual(unclassifiedTables(names), []);
  });

  test("a table that is not in any list is reported", () => {
    assert.deepEqual(unclassifiedTables(["users", "brand_new_table", "__drizzle_migrations"]), ["brand_new_table"]);
  });

  test("accounts and reference data are never deleted", () => {
    for (const t of [...ACCOUNT_TABLES, "workflow_templates", "reference_snapshots", "audit_logs", "expense_categories", "document_types"]) {
      assert.ok(PRESERVE.includes(t), `${t} must be preserved`);
      assert.ok(!DELETE_ORDER.includes(t), `${t} must not be deleted`);
    }
    for (const t of SPECIAL) assert.ok(!DELETE_ORDER.includes(t), `${t} is handled specially`);
  });

  test("no table is both kept and deleted, or listed twice", () => {
    assert.equal(new Set(DELETE_ORDER).size, DELETE_ORDER.length);
    for (const t of DELETE_ORDER) assert.ok(!PRESERVE.includes(t), `${t} is in both lists`);
  });

  test("children are deleted before the tables they reference", async () => {
    const position = new Map(DELETE_ORDER.map((t, i) => [t, i]));
    for (const table of await schemaTables()) {
      const cfg = getTableConfig(table);
      const at = position.get(cfg.name);
      if (at === undefined) continue;
      for (const fk of cfg.foreignKeys) {
        const parent = getTableConfig(fk.reference().foreignTable as PgTable).name;
        const parentAt = position.get(parent);
        if (parent === cfg.name || parentAt === undefined) continue;
        assert.ok(at < parentAt, `${cfg.name} references ${parent}, so it must be deleted first`);
      }
    }
  });
});
