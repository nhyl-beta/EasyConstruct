// apps/api/src/scripts/demo-cashflow.ts
//
// Gives the Finance Dashboard six months of cash flow on a demo/staging
// database, so the chart is not empty and every number reconciles.
//
//   1. BACKDATES the already-approved demo expenses (expenses.submitted_at) and
//      approved payroll decisions (payroll_batch_decisions.decided_at) across
//      the last 6 calendar months. Seeding through the API stamps everything
//      "now". Pattern: heavier materials early, labor in the latest months, no
//      cost before its project's planned start, none after today. The order
//      used is (project, category, vendor, amount, id), never the dates, so a
//      re-run produces identical rows.
//   2. Recomputes each month's OUTFLOW from the records (refreshMonth).
//   3. Writes DEMO INFLOW. There is no client-payment record in the system, so
//      per project with a contract value and a start date: an advance of 10% of
//      the contract in the start month, then progress payments every second
//      month after it (lagging costs), never in the current month. The total per
//      project never exceeds contract value x (10% + progress). THIS IS DEMO
//      DATA, not a record of real payments.
//   4. Re-scores expense anomalies (dates feed the duplicate / history rules).
//   5. Prints a reconciliation table and exits non-zero if any stored outflow
//      differs from the recomputed one.
//
// Never touches users, roles or accounts.
//
// Guards: ALLOW_DEMO_RESET=true, host local or in DEMO_RESET_ALLOWED_HOSTS, the
// target printed, and for a real run --confirm-target=<host> typed by a person
// who has checked it is the STAGING database. JSON backup of every table it
// changes is written and verified first; all changes are ONE transaction.
//
// Usage:  npm run demo:cashflow -- --dry-run
//         npm run demo:cashflow -- --confirm-target=<host>
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { and, eq, sql } from "drizzle-orm";

import { db } from "../core/db/connection.js";
import { budgets, cashFlowEntries, expenses, payrollBatches } from "../core/db/schema/finance.js";
import { payrollBatchDecisions } from "../core/db/schema/payroll.js";
import { projects } from "../core/db/schema/projects.js";
import { FEATURES } from "../core/config/features.js";
import { assignSlots, pickInstant, projectInflow } from "../modules/finance/cash-flow/demo-plan.js";
import { keyToLabel, lastMonthKeys, monthKey, round2 } from "../modules/finance/cash-flow/months.js";
import { refreshMonth } from "../modules/finance/cash-flow/service.js";
import { expenseOutflowByMonth, payrollOutflowByMonth } from "../modules/finance/cash-flow/sources.js";
import { expensesService } from "../modules/finance/expenses/services.js";
import { assertDemoDatabase } from "./demo-guard.js";

const DRY = process.argv.includes("--dry-run");
const confirm = process.argv.find((a) => a.startsWith("--confirm-target="))?.split("=")[1];
const peso = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Plan = {
  expenseDates: Map<string, Date>;
  decisionDates: Map<number, Date>;
  inflow: Map<string, number>;
  skipped: string[];
};

async function loadAndPlan(now: Date, window: string[]): Promise<Plan> {
  const projectRows = await db.select().from(projects);
  const byCode = new Map(projectRows.map((p) => [p.code, p]));
  const startOf = (code: string | null): Date | undefined => {
    const s = code ? byCode.get(code)?.plannedStartDate : null;
    return s ? new Date(`${s}T00:00:00Z`) : undefined;
  };
  const allowedFor = (code: string | null): string[] => {
    const start = startOf(code);
    return window.filter((k) => !start || k >= monthKey(start));
  };

  const plan: Plan = { expenseDates: new Map(), decisionDates: new Map(), inflow: new Map(), skipped: [] };

  // Expenses, grouped per project.
  const approved = (await db.select().from(expenses).where(eq(expenses.status, "approved"))).sort((a, b) =>
    [a.project, a.category, a.vendor].join("|").localeCompare([b.project, b.category, b.vendor].join("|")) || a.amount - b.amount || a.id.localeCompare(b.id),
  );
  const perProject = new Map<string, typeof approved>();
  for (const e of approved) perProject.set(e.project, [...(perProject.get(e.project) ?? []), e]);
  for (const [code, list] of perProject) {
    const allowed = allowedFor(code);
    if (allowed.length === 0) {
      plan.skipped.push(`${list.length} expense(s) of ${code}: project starts after today, left as they are`);
      continue;
    }
    // Materials and equipment early, the rest later: order by category first.
    const early = ["Materials", "Equipment"];
    const ordered = [...list].sort((a, b) => Number(early.includes(b.category)) - Number(early.includes(a.category)));
    const slots = assignSlots(ordered.length, allowed.length);
    ordered.forEach((e, i) => plan.expenseDates.set(e.id, pickInstant(allowed[slots[i]!]!, e.id, now, startOf(code))));
  }

  // Approved payroll decisions: steady, latest months first.
  const decisions = await db
    .select({ id: payrollBatchDecisions.id, batchId: payrollBatchDecisions.batchId, project: payrollBatches.projectCode })
    .from(payrollBatchDecisions)
    .innerJoin(payrollBatches, eq(payrollBatches.id, payrollBatchDecisions.batchId))
    .where(and(eq(payrollBatchDecisions.action, "approved"), eq(payrollBatches.status, "approved")));
  const byProject = new Map<string, typeof decisions>();
  for (const d of decisions.sort((a, b) => a.batchId.localeCompare(b.batchId))) {
    byProject.set(d.project ?? "", [...(byProject.get(d.project ?? "") ?? []), d]);
  }
  for (const [code, list] of byProject) {
    const allowed = allowedFor(code || null);
    if (allowed.length === 0) {
      plan.skipped.push(`${list.length} payroll decision(s) of ${code}: project starts after today, left as they are`);
      continue;
    }
    list.forEach((d, j) => {
      const key = allowed[allowed.length - 1 - (j % allowed.length)]!;
      plan.decisionDates.set(d.id, pickInstant(key, d.batchId, now, startOf(code || null)));
    });
  }

  // Demo inflow.
  for (const p of projectRows) {
    const m = projectInflow(
      { code: p.code, contractValue: Number(p.contractValue ?? 0), plannedStart: p.plannedStartDate, progress: p.progress },
      window,
      now,
    );
    for (const [k, v] of m) plan.inflow.set(k, round2((plan.inflow.get(k) ?? 0) + v));
  }
  return plan;
}

async function backup(): Promise<string> {
  const dir = path.resolve(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `cashflow-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const dump = {
    takenAt: new Date().toISOString(),
    expenses: await db.select().from(expenses),
    payroll_batch_decisions: await db.select().from(payrollBatchDecisions),
    payroll_batches: await db.select().from(payrollBatches),
    cash_flow_entries: await db.select().from(cashFlowEntries),
  };
  fs.writeFileSync(file, JSON.stringify(dump));
  // Verify: re-read the file and compare row counts with the live tables.
  const back = JSON.parse(fs.readFileSync(file, "utf8")) as typeof dump;
  const live = {
    expenses: (await db.select({ n: sql<number>`count(*)::int` }).from(expenses))[0]!.n,
    payroll_batch_decisions: (await db.select({ n: sql<number>`count(*)::int` }).from(payrollBatchDecisions))[0]!.n,
    payroll_batches: (await db.select({ n: sql<number>`count(*)::int` }).from(payrollBatches))[0]!.n,
    cash_flow_entries: (await db.select({ n: sql<number>`count(*)::int` }).from(cashFlowEntries))[0]!.n,
  };
  for (const t of Object.keys(live) as Array<keyof typeof live>) {
    if (back[t].length !== live[t]) throw new Error(`Backup verification failed for ${t}: ${back[t].length} in file, ${live[t]} in database`);
  }
  console.log(`Backup verified: ${file} (${Object.entries(live).map(([t, n]) => `${t}=${n}`).join(", ")})`);
  return file;
}

async function main() {
  const { host } = assertDemoDatabase();
  if (!DRY && confirm !== host) {
    throw new Error(`REFUSED: confirm that ${host} is the STAGING database, then re-run with --confirm-target=${host}`);
  }

  const now = new Date();
  const window = lastMonthKeys(6, now);
  const plan = await loadAndPlan(now, window);
  console.log(`\nPlan: re-date ${plan.expenseDates.size} approved expense(s) and ${plan.decisionDates.size} approved payroll decision(s) across ${window.map(keyToLabel).join(", ")}.`);
  plan.skipped.forEach((s) => console.log(`  note: ${s}`));

  if (DRY) {
    const exp = new Map<string, number>();
    const rows = await db.select().from(expenses).where(eq(expenses.status, "approved"));
    for (const e of rows) {
      const at = plan.expenseDates.get(e.id) ?? e.submittedAt;
      exp.set(monthKey(at), round2((exp.get(monthKey(at)) ?? 0) + e.amount));
    }
    console.log("\nProjected expense outflow by month (payroll not projected in a dry run):");
    console.table(Object.fromEntries(window.map((k) => [keyToLabel(k), { expenseOutflow: peso(exp.get(k) ?? 0), demoInflow: peso(plan.inflow.get(k) ?? 0) }])));
    console.log("Dry run complete — nothing changed.");
    return;
  }

  await backup();

  await db.transaction(async (tx) => {
    for (const [id, at] of plan.expenseDates) await tx.update(expenses).set({ submittedAt: at }).where(eq(expenses.id, id));
    for (const [id, at] of plan.decisionDates) {
      await tx.update(payrollBatchDecisions).set({ decidedAt: at }).where(eq(payrollBatchDecisions.id, id));
      const [d] = await tx.select().from(payrollBatchDecisions).where(eq(payrollBatchDecisions.id, id));
      if (!d) continue;
      // Keep the batch's own timeline consistent: review time = decision time, submission not after it.
      const [b] = await tx.select().from(payrollBatches).where(eq(payrollBatches.id, d.batchId));
      const earlier = new Date(at.getTime() - 2 * 86_400_000);
      await tx
        .update(payrollBatches)
        .set({
          reviewedAt: at,
          submittedAt: b?.submittedAt && b.submittedAt <= at ? b.submittedAt : earlier,
          createdAt: b?.createdAt && b.createdAt <= at ? b.createdAt : earlier,
        })
        .where(eq(payrollBatches.id, d.batchId));
    }

    // Months to recompute: the window plus any month that already has a row.
    const existing = (await tx.select().from(cashFlowEntries)).map((r) => r.month);
    const keys = new Set(window);
    for (const label of existing) {
      const m = /^([A-Za-z]{3}) (\d{4})$/.exec(label);
      if (m) keys.add(`${m[2]}-${String(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1]!.toLowerCase()) + 1).padStart(2, "0")}`);
    }
    for (const k of [...keys].sort()) await refreshMonth(k, tx);

    // Demo inflow, for the window months; months outside it carry none.
    for (const k of keys) {
      await tx
        .update(cashFlowEntries)
        .set({ inflow: plan.inflow.get(k) ?? 0 })
        .where(eq(cashFlowEntries.month, keyToLabel(k)));
    }

    // Reconcile inside the transaction: refuse to commit if a stored outflow differs.
    const exp = await expenseOutflowByMonth(tx);
    const pay = await payrollOutflowByMonth(tx);
    for (const r of await tx.select().from(cashFlowEntries)) {
      const key = [...keys].find((k) => keyToLabel(k) === r.month);
      if (!key) continue;
      const expected = round2((exp.get(key) ?? 0) + (pay.get(key) ?? 0));
      if (Math.abs(expected - r.outflow) > 0.005) throw new Error(`Reconciliation failed for ${r.month}: stored ${r.outflow}, recomputed ${expected}`);
    }
  });

  if (FEATURES.ai) {
    const r = await expensesService.rescoreAll();
    console.log(`\nAnomaly re-score: ${r.scored} expenses, ${r.flagged} flagged.`);
  }

  // Final report (read-only).
  const exp = await expenseOutflowByMonth();
  const pay = await payrollOutflowByMonth();
  const stored = new Map((await db.select().from(cashFlowEntries)).map((r) => [r.month, r]));
  let mismatch = 0;
  const table: Record<string, Record<string, string>> = {};
  for (const k of window) {
    const label = keyToLabel(k);
    const e = exp.get(k) ?? 0;
    const p = pay.get(k) ?? 0;
    const row = stored.get(label);
    const total = round2(e + p);
    if (!row || Math.abs(row.outflow - total) > 0.005) mismatch += 1;
    table[label] = {
      expenseOutflow: peso(e),
      payrollOutflow: peso(p),
      total: peso(total),
      storedOutflow: row ? peso(row.outflow) : "MISSING",
      demoInflow: row ? peso(row.inflow) : "MISSING",
      net: row ? peso(row.inflow - row.outflow) : "-",
    };
  }
  console.log("\nReconciliation (pesos):");
  console.table(table);

  const unmatched = await db
    .select({ category: expenses.category, project: expenses.project, total: sql<number>`sum(${expenses.amount})::float`, n: sql<number>`count(*)::int` })
    .from(expenses)
    .where(
      and(
        eq(expenses.status, "approved"),
        sql`not exists (select 1 from ${budgets} where ${budgets.project} = ${expenses.project} and ${budgets.category} = ${expenses.category})`,
      ),
    )
    .groupBy(expenses.category, expenses.project);
  console.log("\nApproved spend with no matching budget line (project + category):");
  if (unmatched.length === 0) console.log("  none");
  else console.table(unmatched.map((r) => ({ category: r.category, project: r.project, expenses: r.n, amount: peso(r.total) })));

  if (mismatch > 0) {
    console.error(`\n${mismatch} month(s) do not reconcile.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll six months reconcile.");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$client.end();
  });
