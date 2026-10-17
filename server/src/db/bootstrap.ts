// Building a FRESH database (npm --prefix server run db:bootstrap). Pure helpers, no I/O: unit-tested in bootstrap.test.ts.
//
// Why this exists: the migration chain cannot build an empty database (0011 fails because 0006 already created
// payroll_batches, and the chain stops short of the Drizzle schema in places), so a new server is built from the
// Drizzle schema instead, and the migration table is then filled in so `db:migrate` has nothing left to do.
//
// This is NEVER for an existing database such as Neon. bootstrapRefusal() stops it unless the database is empty.
import { hashSql, type MigrationFile } from "./migrations.js";

export interface DbState {
  /** public.projects exists. */
  projectsTableExists: boolean;
  /** Rows in drizzle.__drizzle_migrations (0 when the table does not exist). */
  recordedMigrations: number;
}

/** Why the bootstrap must not run, or null when the database is empty. */
export const bootstrapRefusal = (state: DbState): string | null => {
  if (state.projectsTableExists) return "public.projects already exists, so this is not an empty database. db:bootstrap only builds a new, empty database; use db:migrate for an existing one.";
  if (state.recordedMigrations > 0) return `drizzle.__drizzle_migrations already has ${state.recordedMigrations} row(s), so this database was set up before. Use db:migrate.`;
  return null;
};

// ── Objects the migrations create that the Drizzle schema does not describe ─
// Found by building one database with drizzle-kit push and one by replaying every migration statement, then diffing the
// catalogs (see docs/client-demo-changes-progress.md, "Fresh database setup"). All are IF NOT EXISTS, so running twice is safe.

export const EXTRA_SEQUENCES = ["purchase_request_seq", "procurement_order_seq", "reimbursement_seq", "expense_seq"] as const;

export const EXTRA_INDEXES: readonly { name: string; sql: string }[] = [
  { name: "design_requests_assignee_idx", sql: 'CREATE INDEX IF NOT EXISTS "design_requests_assignee_idx" ON "design_requests" ("assigned_to_user_id")' },
  { name: "design_requests_project_idx", sql: 'CREATE INDEX IF NOT EXISTS "design_requests_project_idx" ON "design_requests" ("project_code")' },
  { name: "design_revisions_design_version_uq", sql: 'CREATE UNIQUE INDEX IF NOT EXISTS "design_revisions_design_version_uq" ON "design_revisions" ("design_id", "version")' },
  { name: "documents_report_idx", sql: 'CREATE INDEX IF NOT EXISTS "documents_report_idx" ON "documents" ("project", "report_period", "period_date")' },
  { name: "plan_suggestion_items_suggestion_idx", sql: 'CREATE INDEX IF NOT EXISTS "plan_suggestion_items_suggestion_idx" ON "plan_suggestion_items" ("suggestion_id", "state")' },
  { name: "plan_suggestions_project_idx", sql: 'CREATE INDEX IF NOT EXISTS "plan_suggestions_project_idx" ON "plan_suggestions" ("project_code")' },
  { name: "projects_client_id_idx", sql: 'CREATE INDEX IF NOT EXISTS "projects_client_id_idx" ON "projects" ("client_id")' },
  { name: "stored_files_status_idx", sql: 'CREATE INDEX IF NOT EXISTS "stored_files_status_idx" ON "stored_files" ("integrity_status")' },
  { name: "transmittals_project_seq_uq", sql: 'CREATE UNIQUE INDEX IF NOT EXISTS "transmittals_project_seq_uq" ON "transmittals" ("project_code", "sequence")' },
];

export const extraSql = (): string[] => [...EXTRA_SEQUENCES.map((s) => `CREATE SEQUENCE IF NOT EXISTS "${s}" START 1`), ...EXTRA_INDEXES.map((i) => i.sql)];

// ── Reference data the migrations insert ───────────────────────────────────

/**
 * Every migration (0000 onward) that changes ROWS, and what the bootstrap does with it. A migration that is not listed
 * here but has an INSERT, UPDATE or DELETE fails bootstrap.test.ts, so new reference data cannot be forgotten.
 *  - "inserts": its INSERT statements are idempotent (ON CONFLICT DO NOTHING / WHERE NOT EXISTS) and are run by the bootstrap.
 *  - "empty-noop": it only rewrites or de-duplicates rows that exist in an old database; on an empty one it does nothing.
 */
export const DATA_MIGRATIONS: Readonly<Record<string, "inserts" | "empty-noop">> = {
  "0015_payroll_lifecycle": "empty-noop", // UPDATE payroll_batches: rename status 'rejected'
  "0019_fix_report_project_case": "empty-noop", // UPDATE engineering_reports: fix project code case
  "0022_design_delivery": "inserts", // workflow_templates: "Design Turnover"
  "0024_cash_flow_month_unique": "empty-noop", // DELETE duplicate cash_flow_entries months
  "0026_expense_categories": "inserts", // expense_categories: the 10 starting categories
  "0034_document_types": "inserts", // document_types: the starting types
  "0040_pm_reports": "inserts", // document_types: Daily, Weekly and Monthly Report
};

const DATA_LINE = /^[ \t]*(INSERT[ \t]+INTO|UPDATE[ \t]+"|DELETE[ \t]+FROM)\b/im;
const INSERT_STATEMENT = /INSERT[ \t]+INTO[\s\S]*?;[ \t]*(?:\r?\n|$)/gi;

/** Migrations with a row-changing statement that DATA_MIGRATIONS does not mention. Must stay empty. */
export const unclassifiedDataMigrations = (migrations: readonly MigrationFile[]): string[] =>
  migrations.filter((m) => DATA_LINE.test(m.sql) && !(m.tag in DATA_MIGRATIONS)).map((m) => m.tag);

/** DATA_MIGRATIONS entries that name a migration that does not exist (a typo would silently skip a step). */
export const unknownDataMigrations = (migrations: readonly MigrationFile[]): string[] => Object.keys(DATA_MIGRATIONS).filter((tag) => !migrations.some((m) => m.tag === tag));

/** The INSERT statements to run on a new database, in migration order, taken from the migration files themselves. */
export const dataSteps = (migrations: readonly MigrationFile[]): { tag: string; sql: string }[] =>
  migrations
    .filter((m) => DATA_MIGRATIONS[m.tag] === "inserts")
    .flatMap((m) => (m.sql.match(INSERT_STATEMENT) ?? []).map((s) => ({ tag: m.tag, sql: s.trim().replace(/;$/, "") })));

// ── Migration bookkeeping ──────────────────────────────────────────────────

/** The rows migrate.ts would have written: the sha256 of the file and its journal timestamp, in order. */
export const journalRows = (migrations: readonly MigrationFile[]): { tag: string; hash: string; createdAt: number }[] =>
  migrations.map((m) => ({ tag: m.tag, hash: hashSql(m.sql), createdAt: m.when }));

// ── Comparing a database with the Drizzle schema ───────────────────────────

/**
 * drizzle-kit always reports some differences even right after a push: it re-emits ROW LEVEL SECURITY, rewrites
 * numeric defaults of 0, and re-creates foreign keys whose names Postgres cut to 63 characters. Those are not real
 * differences. Everything else (a missing table, column, index or a changed type) is.
 */
export const isKnownSchemaNoise = (statement: string): boolean => {
  const s = statement.trim();
  if (s === "") return true;
  if (/DISABLE ROW LEVEL SECURITY;?$/i.test(s)) return true;
  if (/^ALTER TABLE "\w+" ALTER COLUMN "\w+" SET DEFAULT 0;?$/i.test(s)) return true;
  const fk = s.match(/^ALTER TABLE "\w+" (?:DROP CONSTRAINT|ADD CONSTRAINT) "(\w+)"/i);
  return fk != null && fk[1]!.length >= 63; // Postgres keeps only the first 63 characters of a name
};

/** A drop of an index or sequence the migrations create on purpose (EXTRA_INDEXES, EXTRA_SEQUENCES) is expected, not a difference. */
export const isExpectedExtraDrop = (statement: string): boolean => {
  const s = statement.trim();
  const index = s.match(/^DROP INDEX(?: IF EXISTS)? "(?:public"\.")?(\w+)"/i);
  if (index) return EXTRA_INDEXES.some((i) => i.name === index[1]);
  const sequence = s.match(/^DROP SEQUENCE(?: IF EXISTS)? "(?:public"\.")?(\w+)"/i);
  return sequence != null && (EXTRA_SEQUENCES as readonly string[]).includes(sequence[1]!);
};

export const realSchemaDifferences = (statements: readonly string[]): string[] => statements.map((s) => s.trim()).filter((s) => !isKnownSchemaNoise(s) && !isExpectedExtraDrop(s));
