import { assertDemoEnvironment } from "./demo-guard.js";
assertDemoEnvironment();

// apps/api/scripts/demo/reset-demo-data.ts
//
// Clean-slate reset: removes EVERY project and all project-scoped data, then
// resets the employees table to exactly 100 rows (50 account-linked rows kept
// untouched + 50 deterministic roster rows). Accounts are read-only: users,
// password_reset_tokens and roles are never written, and their checksums are
// recorded before and compared after.
//
// Guards (all mandatory):
//   * ALLOW_DEMO_RESET=true
//   * the DB host must be local, or listed in DEMO_RESET_ALLOWED_HOSTS
//     (comma-separated). The host and database name are printed first.
//   * a full backup (every public table, JSON) is written and verified BEFORE any delete
//   * everything runs in ONE transaction; any failure rolls back
//
// Usage:  npm run demo:reset -- --dry-run      (prints row counts, changes nothing)
//         npm run demo:reset                   (executes)
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { assertDemoDatabase } from "./demo-guard.js";
import { buildRoster, upsertRoster } from "./demo-roster.js";

const DRY = process.argv.includes("--dry-run");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** Never written. Checksummed before/after. */
const ACCOUNT_TABLES = ["users", "password_reset_tokens", "roles"];
/** Never deleted (config / reference / history). */
const PRESERVE = [...ACCOUNT_TABLES, "workflow_templates", "reference_snapshots", "audit_logs", "expense_categories"];
/** Handled specially. */
const SPECIAL = ["notifications", "employees"];

/** Delete order: children before parents (derived from the real FK map). */
const DELETE_ORDER = [
  "validation_results", "workflow_attachments", "workflow_line_items", "workflow_stages",
  "plan_suggestion_items", "plan_suggestions", "signal_findings", "decision_support_events",
  "proposals", "workflows",
  "budget_adjustments", "budget_allocations", "budget_approval_steps", "budget_comments",
  "budget_documents", "budget_history", "budgets",
  // Purchasing first: purchase_requests.requirement_id references requirements.
  "procurement_orders", "purchase_requests", "reimbursements",
  "milestone_links", "milestones", "tasks", "issues", "requirements",
  "architect_documents", "blueprints", "design_reviews", "design_revisions", "design_engineers", "designs",
  "revisions", "engineering_reports", "documents", "expenses", "financial_risks", "cash_flow_entries",
  "ai_insights", "approvals_queue",
  "scheduled_reports", "payroll", "payroll_batch_decisions", "payroll_batch_acknowledgements", "payroll_batches", "attendance",
  "transmittal_acknowledgements", "transmittal_items", "transmittals", "design_request_files", "design_requests",
  "project_deliverables",
  "project_phase_history", "project_members", "projects", "clients", "vendors",
];

async function checksums(c: pg.PoolClient) {
  const out: Record<string, string> = {};
  for (const t of ACCOUNT_TABLES) {
    const r = await c.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS h FROM "${t}" x`);
    out[t] = `${r.rows[0].n} rows md5=${r.rows[0].h}`;
  }
  const link = await c.query(
    `SELECT count(*)::int AS n, md5(coalesce(string_agg(id || ':' || employee_id || ':' || user_id, '|' ORDER BY id), '')) AS h FROM employees WHERE user_id IS NOT NULL`,
  );
  out["employee↔user links"] = `${link.rows[0].n} rows md5=${link.rows[0].h}`;
  return out;
}

async function backup(c: pg.PoolClient): Promise<string> {
  const dir = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `neondb-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const tables = (await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1`)).rows.map((r) => r.tablename as string);
  const dump: Record<string, unknown[]> = {};
  let total = 0;
  for (const t of tables) {
    const r = await c.query(`SELECT * FROM "${t}"`);
    dump[t] = r.rows;
    total += r.rows.length;
  }
  fs.writeFileSync(file, JSON.stringify({ takenAt: new Date().toISOString(), tables: dump }));
  const size = fs.statSync(file).size;
  if (size < 1000 || total === 0) throw new Error("Backup looks empty — refusing to continue.");
  console.log(`Backup written: ${file} (${tables.length} tables, ${total} rows, ${(size / 1024).toFixed(0)} KB)`);
  return file;
}

async function main() {
  assertDemoDatabase();

  const c = await pool.connect();
  try {
    // Coverage check: every public table must be classified, otherwise abort.
    const tables = (await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'`)).rows.map((r) => r.tablename as string);
    const known = new Set([...PRESERVE, ...SPECIAL, ...DELETE_ORDER]);
    const unknown = tables.filter((t) => !known.has(t) && !t.startsWith("__drizzle") && t !== "drizzle_migrations");
    if (unknown.length) throw new Error(`REFUSED: unclassified tables: ${unknown.join(", ")}`);

    const before = await checksums(c);
    console.log("\nAccount checksums BEFORE:");
    console.table(before);

    console.log(`\n${DRY ? "DRY RUN — would delete" : "Deleting"} (rows per table):`);
    const counts: Record<string, number> = {};
    for (const t of DELETE_ORDER.filter((t) => tables.includes(t))) {
      counts[t] = (await c.query(`SELECT count(*)::int n FROM "${t}"`)).rows[0].n;
    }
    counts["notifications (project_code IS NOT NULL)"] = (await c.query(`SELECT count(*)::int n FROM notifications WHERE project_code IS NOT NULL`)).rows[0].n;
    counts["employees (user_id IS NULL)"] = (await c.query(`SELECT count(*)::int n FROM employees WHERE user_id IS NULL`)).rows[0].n;
    console.table(counts);
    console.log("Preserved untouched:", PRESERVE.join(", "), "+ 50 account-linked employees");
    console.log(`Employees after reset: ${(await c.query(`SELECT count(*)::int n FROM employees WHERE user_id IS NOT NULL`)).rows[0].n} linked + ${buildRoster().length} roster`);

    if (DRY) {
      console.log("\nDry run complete — nothing changed.");
      return;
    }

    const file = await backup(c);
    fs.writeFileSync(path.join(path.dirname(file), "account-checksums-before.json"), JSON.stringify(before, null, 2));

    await c.query("BEGIN");
    try {
      for (const t of DELETE_ORDER.filter((t) => tables.includes(t))) await c.query(`DELETE FROM "${t}"`);
      await c.query(`DELETE FROM notifications WHERE project_code IS NOT NULL`);
      await c.query(`DELETE FROM employees WHERE user_id IS NULL`);
      const n = await upsertRoster(c);
      const total = (await c.query(`SELECT count(*)::int n FROM employees`)).rows[0].n;
      if (total !== 100) throw new Error(`Employee count is ${total}, expected 100 — rolling back.`);
      const mid = await checksums(c);
      for (const k of Object.keys(before)) if (before[k] !== mid[k]) throw new Error(`Checksum changed for ${k} — rolling back.`);
      await c.query("COMMIT");
      console.log(`\nCOMMITTED. Inserted ${n} roster employees; employees total = ${total}.`);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }

    const after = await checksums(c);
    console.log("\nAccount checksums AFTER:");
    console.table(after);
    const same = Object.keys(before).every((k) => before[k] === after[k]);
    console.log(same ? "ALL ACCOUNT CHECKSUMS MATCH." : "!! CHECKSUM MISMATCH !!");
    if (!same) process.exitCode = 1;
  } finally {
    c.release();
  }
}

main()
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => pool.end());
