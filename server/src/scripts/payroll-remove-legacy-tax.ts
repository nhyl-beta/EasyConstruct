// server/src/scripts/payroll-remove-legacy-tax.ts
//
// ONE-OFF cleanup for payroll saved before income-tax withholding was removed.
// Delete this file once it has been run with --apply.
//
// Old lines and batches have the tax inside their stored `deductions` and
// `net`. This makes them consistent with the three-contribution rule:
//   * lines with a non-zero withholding_tax: deductions -= tax, net += tax,
//     then withholding_tax = 0
//   * rate_versions: the "tax" key is removed
//   * batches that owned an affected line: deductions and net_payroll are
//     recomputed from their lines
//   * decisions with reason incorrect_withholding_tax become
//     incorrect_government_rate
//
// DRY RUN BY DEFAULT: everything runs inside a transaction that is rolled back,
// and the before/after counts are printed. Pass --apply to commit. Safe to run
// twice (the second run finds nothing to change).
//
//   npx tsx src/scripts/payroll-remove-legacy-tax.ts          # dry run
//   npx tsx src/scripts/payroll-remove-legacy-tax.ts --apply  # commit
//
// The `withholding_tax` column itself is left in place on purpose (it is
// NOT NULL DEFAULT 0, so inserts that omit it keep working); drop it later.
import "dotenv/config";
import pg from "pg";

const apply = process.argv.includes("--apply");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function counts(client: pg.PoolClient) {
  const one = async (sql: string) => (await client.query(sql)).rows[0] as Record<string, string>;
  return {
    linesWithTax: await one(`SELECT count(*)::int AS n, coalesce(sum(withholding_tax), 0) AS total FROM payroll WHERE withholding_tax <> 0`),
    linesWithTaxVersion: await one(`SELECT count(*)::int AS n FROM payroll WHERE rate_versions ? 'tax'`),
    decisions: await one(`SELECT count(*)::int AS n FROM payroll_batch_decisions WHERE reason_code = 'incorrect_withholding_tax'`),
    lineTotals: await one(`SELECT coalesce(sum(deductions), 0) AS deductions, coalesce(sum(net), 0) AS net FROM payroll`),
    batchTotals: await one(`SELECT coalesce(sum(deductions), 0) AS deductions, coalesce(sum(net_payroll), 0) AS net FROM payroll_batches`),
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  console.log(`Target database host: ${new URL(url).hostname}`);
  console.log(apply ? "MODE: --apply (changes will be committed)" : "MODE: dry run (nothing will be saved)");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("\nBEFORE", JSON.stringify(await counts(client), null, 2));

    await client.query(`
      CREATE TEMP TABLE affected_batches ON COMMIT DROP AS
      SELECT DISTINCT batch_id FROM payroll WHERE withholding_tax <> 0 AND batch_id IS NOT NULL
    `);
    const lines = await client.query(`
      UPDATE payroll
      SET deductions = deductions - withholding_tax,
          net = net + withholding_tax,
          withholding_tax = 0
      WHERE withholding_tax <> 0
    `);
    const versions = await client.query(`UPDATE payroll SET rate_versions = rate_versions - 'tax' WHERE rate_versions ? 'tax'`);
    const batches = await client.query(`
      UPDATE payroll_batches b
      SET deductions = s.deductions, net_payroll = s.net
      FROM (
        SELECT batch_id, sum(deductions) AS deductions, sum(net) AS net
        FROM payroll WHERE batch_id IN (SELECT batch_id FROM affected_batches) GROUP BY batch_id
      ) s
      WHERE b.id = s.batch_id
    `);
    const decisions = await client.query(`
      UPDATE payroll_batch_decisions SET reason_code = 'incorrect_government_rate'
      WHERE reason_code = 'incorrect_withholding_tax'
    `);

    console.log(`\nCHANGED lines=${lines.rowCount} rateVersions=${versions.rowCount} batches=${batches.rowCount} decisions=${decisions.rowCount}`);
    console.log("\nAFTER", JSON.stringify(await counts(client), null, 2));

    if (apply) {
      await client.query("COMMIT");
      console.log("\nCommitted.");
    } else {
      await client.query("ROLLBACK");
      console.log("\nDry run: rolled back. Re-run with --apply to commit.");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
