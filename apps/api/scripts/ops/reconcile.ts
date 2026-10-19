// apps/api/scripts/ops/reconcile.ts (objectives fix 1.3)
//
// Runs the same cross-checks as GET /api/admin/reconciliation and prints them.
// Read-only: it never repairs anything. Exits with code 1 when any check fails,
// so it can sit in a deploy or cron step.
//
//   npm --prefix server run reconcile
import "dotenv/config";
import { runReconciliation } from "../../src/modules/insights/reconciliation/service.js";

async function main() {
  const report = await runReconciliation();
  console.log(`Reconciliation ${report.passed ? "PASSED" : "FAILED"}: ${report.total - report.failing} of ${report.total} checks pass (${report.ranAt})\n`);
  for (const check of report.checks) {
    console.log(`${check.status === "pass" ? "PASS" : "FAIL"}  ${check.title}  (${check.checked} checked)`);
    if (check.status === "fail") {
      console.log(`      ${check.basis}`);
      for (const m of check.mismatches.slice(0, 5)) console.log(`      - ${m.subject}: ${m.detail}`);
      if (check.mismatchCount > 5) console.log(`      ... and ${check.mismatchCount - 5} more`);
    }
  }
  process.exit(report.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
