import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATA_MIGRATIONS,
  EXTRA_INDEXES,
  EXTRA_SEQUENCES,
  bootstrapRefusal,
  dataSteps,
  extraSql,
  isExpectedExtraDrop,
  isKnownSchemaNoise,
  journalRows,
  realSchemaDifferences,
  unclassifiedDataMigrations,
  unknownDataMigrations,
} from "./bootstrap.js";
import { hashSql, loadMigrations } from "./migrations.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "drizzle");
const migrations = loadMigrations(drizzleDir);

describe("bootstrapRefusal: only an empty database may be built", () => {
  test("an empty database is allowed", () => {
    assert.equal(bootstrapRefusal({ projectsTableExists: false, recordedMigrations: 0 }), null);
  });
  test("an existing schema is refused, whatever the journal says", () => {
    assert.match(bootstrapRefusal({ projectsTableExists: true, recordedMigrations: 0 })!, /public\.projects already exists/);
    assert.match(bootstrapRefusal({ projectsTableExists: true, recordedMigrations: 41 })!, /not an empty database/);
  });
  test("a recorded migration is refused even without public.projects", () => {
    assert.match(bootstrapRefusal({ projectsTableExists: false, recordedMigrations: 3 })!, /3 row/);
  });
});

describe("reference data steps", () => {
  test("every migration that changes rows is classified, and every classified tag exists", () => {
    assert.deepEqual(unclassifiedDataMigrations(migrations), []);
    assert.deepEqual(unknownDataMigrations(migrations), []);
  });
  test("a migration with an unlisted INSERT, UPDATE or DELETE would be caught", () => {
    const fake = (sql: string) => [{ idx: 99, when: 1, tag: "0099_x", sql, hash: hashSql(sql), statements: [sql] }];
    assert.deepEqual(unclassifiedDataMigrations(fake('INSERT INTO "t" ("a") VALUES (1);')), ["0099_x"]);
    assert.deepEqual(unclassifiedDataMigrations(fake('UPDATE "t" SET "a" = 1;')), ["0099_x"]);
    assert.deepEqual(unclassifiedDataMigrations(fake('DELETE FROM "t";')), ["0099_x"]);
    assert.deepEqual(unclassifiedDataMigrations(fake('ALTER TABLE "t" ADD CONSTRAINT "c" FOREIGN KEY ("a") REFERENCES "u"("id") ON UPDATE no action;')), []);
  });
  test("the steps come from the migration files, in order, and each is idempotent", () => {
    const steps = dataSteps(migrations);
    assert.deepEqual([...new Set(steps.map((s) => s.tag))], ["0022_design_delivery", "0026_expense_categories", "0034_document_types", "0040_pm_reports"]);
    assert.equal(steps.length, 4);
    for (const s of steps) {
      assert.match(s.sql, /^INSERT INTO/);
      assert.ok(!s.sql.endsWith(";"));
      assert.match(s.sql, /ON CONFLICT|WHERE NOT EXISTS/i, `${s.tag} must be insert-if-missing`);
    }
    assert.ok(steps.find((s) => s.tag === "0022_design_delivery")!.sql.includes("Design Turnover"));
    assert.ok(steps.find((s) => s.tag === "0040_pm_reports")!.sql.includes("Monthly Report"));
  });
  test("the 0022 insert keeps its semicolons inside the text (it is not cut at the first one)", () => {
    const sql = dataSteps(migrations).find((s) => s.tag === "0022_design_delivery")!.sql;
    assert.ok(sql.includes("PM and Admin sign off the turnover to the client.") && sql.includes("WHERE NOT EXISTS"));
  });
  test("row-only migrations that do nothing on an empty database are never run", () => {
    const skipped = Object.entries(DATA_MIGRATIONS).filter(([, v]) => v === "empty-noop").map(([k]) => k);
    assert.deepEqual(skipped, ["0015_payroll_lifecycle", "0019_fix_report_project_case", "0024_cash_flow_month_unique"]);
    assert.ok(dataSteps(migrations).every((s) => !skipped.includes(s.tag)));
  });
});

describe("migration bookkeeping", () => {
  test("one row per migration, in order, with the hash and timestamp migrate.ts records", () => {
    const rows = journalRows(migrations);
    assert.equal(rows.length, migrations.length);
    rows.forEach((r, i) => {
      assert.equal(r.tag, migrations[i]!.tag);
      assert.equal(r.hash, migrations[i]!.hash);
      assert.equal(r.hash, hashSql(migrations[i]!.sql));
      assert.equal(r.createdAt, migrations[i]!.when);
    });
    assert.equal(new Set(rows.map((r) => r.hash)).size, rows.length);
  });
});

describe("objects only the migrations define", () => {
  test("every extra index and sequence really appears in a migration, under the same name", () => {
    const all = migrations.map((m) => m.sql).join("\n");
    for (const i of EXTRA_INDEXES) assert.ok(all.includes(`"${i.name}"`), `${i.name} not found in any migration`);
    for (const s of EXTRA_SEQUENCES) assert.ok(all.includes(`"${s}"`), `${s} not found in any migration`);
  });
  test("every statement is safe to run twice", () => {
    for (const s of extraSql()) assert.match(s, /IF NOT EXISTS/);
    assert.equal(extraSql().length, EXTRA_SEQUENCES.length + EXTRA_INDEXES.length);
  });
});

describe("comparing with the Drizzle schema", () => {
  test("what drizzle-kit always reports is noise", () => {
    assert.ok(isKnownSchemaNoise('ALTER TABLE "cash_flow_entries" DISABLE ROW LEVEL SECURITY;'));
    assert.ok(isKnownSchemaNoise('ALTER TABLE "payroll" ALTER COLUMN "hours" SET DEFAULT 0;'));
    const long = "validation_results_matched_snapshot_id_reference_snapshots_id_fk";
    assert.ok(isKnownSchemaNoise(`ALTER TABLE "validation_results" ADD CONSTRAINT "${long}" FOREIGN KEY ("a") REFERENCES "b"("id");`));
    assert.ok(isKnownSchemaNoise(`ALTER TABLE "validation_results" DROP CONSTRAINT "${long.slice(0, 63)}";`));
  });
  test("real differences are not noise", () => {
    assert.ok(!isKnownSchemaNoise('CREATE TABLE "x" ("id" serial);'));
    assert.ok(!isKnownSchemaNoise('ALTER TABLE "documents" ADD COLUMN "stage" varchar(50);'));
    assert.ok(!isKnownSchemaNoise('ALTER TABLE "payroll" ALTER COLUMN "hours" SET DEFAULT 8;'));
    assert.ok(!isKnownSchemaNoise('ALTER TABLE "a" ADD CONSTRAINT "short_fk" FOREIGN KEY ("b") REFERENCES "c"("id");'));
    assert.ok(!isKnownSchemaNoise('DROP TABLE "milestones" CASCADE;'));
  });
  test("dropping the migrations' own indexes and sequences is expected, dropping others is not", () => {
    assert.ok(isExpectedExtraDrop('DROP INDEX "projects_client_id_idx";'));
    assert.ok(isExpectedExtraDrop('DROP SEQUENCE "public"."expense_seq";'));
    assert.ok(!isExpectedExtraDrop('DROP INDEX "some_other_idx";'));
    assert.ok(!isExpectedExtraDrop('DROP SEQUENCE "public"."users_id_seq";'));
  });
  test("realSchemaDifferences keeps only what matters", () => {
    const left = realSchemaDifferences(['ALTER TABLE "a" DISABLE ROW LEVEL SECURITY;', 'DROP SEQUENCE "public"."expense_seq";', 'ALTER TABLE "d" ADD COLUMN "x" text;', ""]);
    assert.deepEqual(left, ['ALTER TABLE "d" ADD COLUMN "x" text;']);
  });
});
