// apps/api/src/scripts/remove-claims-data.ts
//
// Clears the data left behind by the removed reimbursement claims feature. The OWNER runs
// this, after the code that removed the feature is deployed and after taking a Neon branch
// or snapshot. Nothing in the application runs it.
//
//   npm --prefix server run db:remove-claims                  dry run (default): counts only
//   npm --prefix server run db:remove-claims -- --apply       delete every row of `reimbursements`
//   npm --prefix server run db:remove-claims -- --apply --with-expenses
//                                                             also delete expenses booked from paid claims
//
// It deletes rows only. It never drops or alters a table, sequence or column, and it never
// deletes anything except rows of `reimbursements` and, with --with-expenses, expenses whose
// source_type is 'reimbursement'. --apply runs in ONE transaction and commits only when the
// targeted rows are gone; any error rolls everything back.
//
// --with-expenses is off by default because those expenses are part of the ledger: deleting
// them lowers expense totals and the "actual" spent against budgets and cash flow.

/** The slice of a pg client this script uses, so tests can pass a mock. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
}

export interface Options {
  apply: boolean;
  withExpenses: boolean;
}

const KNOWN = new Set(["--apply", "--with-expenses"]);

/** Dry run unless --apply is given. Unknown flags are an error, so a typo never means "apply". */
export function parseArgs(argv: string[]): Options {
  const unknown = argv.filter((a) => !KNOWN.has(a));
  if (unknown.length > 0) {
    throw new Error(`Unknown option(s): ${unknown.join(", ")}. Allowed: --apply, --with-expenses.`);
  }
  return { apply: argv.includes("--apply"), withExpenses: argv.includes("--with-expenses") };
}

export const hostOf = (url: string | undefined): string => {
  if (!url) throw new Error("DATABASE_URL is not set.");
  return new URL(url).hostname;
};

export interface Counts {
  claimsByStatus: { status: string; count: number }[];
  claimsTotal: number;
  claimExpenses: number;
}

export async function readCounts(db: Queryable): Promise<Counts> {
  const byStatus = await db.query("SELECT status, count(*)::int AS count FROM reimbursements GROUP BY status ORDER BY status");
  const exp = await db.query("SELECT count(*)::int AS count FROM expenses WHERE source_type = 'reimbursement'");
  const claimsByStatus = byStatus.rows.map((r) => ({ status: String(r.status), count: Number(r.count) }));
  return {
    claimsByStatus,
    claimsTotal: claimsByStatus.reduce((s, r) => s + r.count, 0),
    claimExpenses: Number(exp.rows[0]?.count ?? 0),
  };
}

const printCounts = (c: Counts, log: (m: string) => void) => {
  log(`reimbursements: ${c.claimsTotal} row(s)`);
  for (const r of c.claimsByStatus) log(`  ${r.status}: ${r.count}`);
  log(`expenses with source_type = 'reimbursement': ${c.claimExpenses}`);
};

export const WITH_EXPENSES_WARNING =
  "WARNING: --with-expenses also deletes the expenses booked from paid claims. Expense totals and the 'actual' spent on budgets and cash flow will go DOWN by those amounts.";

export interface Result {
  applied: boolean;
  before: Counts;
  after?: Counts;
}

/**
 * Dry run: reads counts and changes nothing. Apply: one transaction, delete, re-count, and
 * commit only if the targeted rows are gone; otherwise (or on any error) roll back.
 */
export async function runRemoval(db: Queryable, opts: Options, log: (m: string) => void = console.log): Promise<Result> {
  const before = await readCounts(db);
  log(opts.apply ? "APPLY mode." : "DRY RUN: nothing will be changed. Add --apply to delete.");
  log("\nBefore:");
  printCounts(before, log);
  if (opts.withExpenses) log(`\n${WITH_EXPENSES_WARNING}`);

  if (!opts.apply) {
    log(`\nWould delete ${before.claimsTotal} row(s) from reimbursements${opts.withExpenses ? ` and ${before.claimExpenses} claim expense(s)` : ""}. Nothing was changed.`);
    return { applied: false, before };
  }

  await db.query("BEGIN");
  try {
    await db.query("DELETE FROM reimbursements");
    if (opts.withExpenses) await db.query("DELETE FROM expenses WHERE source_type = 'reimbursement'");
    const after = await readCounts(db);
    log("\nAfter (not yet committed):");
    printCounts(after, log);
    if (after.claimsTotal !== 0) throw new Error(`reimbursements still has ${after.claimsTotal} row(s); rolling back.`);
    if (opts.withExpenses && after.claimExpenses !== 0) throw new Error(`${after.claimExpenses} claim expense(s) remain; rolling back.`);
    await db.query("COMMIT");
    log("\nCommitted.");
    return { applied: true, before, after };
  } catch (err) {
    await db.query("ROLLBACK");
    log("\nRolled back. Nothing was changed.");
    throw err;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await import("dotenv/config");
  const host = hostOf(process.env.DATABASE_URL);
  console.log(`Target database host: ${host}`);
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await runRemoval(client, opts);
  } finally {
    await client.end();
  }
}

// Run only when started directly, not when a test imports the functions above.
if (process.argv[1] && /remove-claims-data\.[cm]?[jt]s$/.test(process.argv[1].replace(/\\/g, "/"))) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
