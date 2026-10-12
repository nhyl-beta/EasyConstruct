import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkJournal, hashSql, loadMigrations, planMigrations, splitStatements } from "./migrations.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "drizzle");

test("every .sql file has a journal entry and every entry has a file, in order", () => {
  assert.deepEqual(checkJournal(drizzleDir), []);
});

test("migrations 0027 to 0031 are in the journal", () => {
  const tags = loadMigrations(drizzleDir).map((m) => m.tag);
  for (const t of ["0027_plan_suggestions", "0028_signal_findings", "0029_payroll_acknowledgements", "0030_reference_data", "0031_decision_support_events"]) {
    assert.ok(tags.includes(t), `${t} missing from the journal`);
  }
});

test("migrations added after 0026 are safe to run twice", () => {
  const nonIdempotent = /create\s+(unique\s+)?(table|index)\s+(?!if not exists)|add\s+column\s+(?!if not exists)/i;
  for (const m of loadMigrations(drizzleDir).filter((x) => x.idx >= 27)) {
    assert.doesNotMatch(m.sql, nonIdempotent, `${m.tag} must use IF NOT EXISTS`);
    assert.doesNotMatch(m.sql, /\bdrop\s+(table|column)\b/i, `${m.tag} must be additive`);
  }
});

test("planMigrations is hash based", () => {
  const all = loadMigrations(drizzleDir);
  const recorded = new Set(all.slice(0, 27).map((m) => m.hash));
  const plan = planMigrations(all, recorded);
  assert.equal(plan.alreadyApplied, 27);
  assert.deepEqual(plan.pending.map((m) => m.idx), all.slice(27).map((m) => m.idx));
  assert.equal(planMigrations(all, new Set(all.map((m) => m.hash))).pending.length, 0);
});

test("statements split on drizzle breakpoints", () => {
  assert.deepEqual(splitStatements("A;\n--> statement-breakpoint\nB;\n"), ["A;", "B;"]);
  assert.equal(hashSql("x").length, 64);
});
