// apps/api/src/scripts/demo-seed-owner-payroll.ts
//
// Payroll history for the Owner dashboard's payroll summary, on a demo
// database only (assertDemoDatabase refuses anything that is not local or
// listed in DEMO_RESET_ALLOWED_HOSTS, and needs ALLOW_DEMO_RESET=true):
//
//   * 8 approved weekly periods on DEMO-S4, DEMO-S5 and DEMO-S6, with the
//     crew (and so the cost) growing week on week;
//   * one of those periods with high overtime;
//   * on DEMO-S3: a pending batch older than the alert threshold, a batch that
//     Finance sent back (revision_required), and a draft.
//
// Every line is computed by the real payroll engine (payroll/engine.ts) from
// the employee's stored pay rate, so SSS / PhilHealth / Pag-IBIG / EC
// are the engine's numbers, never typed in. An approved batch is booked the
// way a Finance approval books it (decision row, Labor budget actual, lines
// marked Completed, cash flow month refreshed), and lines carry real
// periodStart / periodEnd dates so the summary orders periods by date.
//
// Idempotent: a batch whose id already exists is skipped, so a second run
// changes nothing. Only payroll, payroll_batches, payroll_batch_decisions,
// budgets.actual and cash_flow_entries are written; users, roles and
// audit_logs are never touched.
//
// Usage:  npm run demo:seed-owner-payroll -- --dry-run
//         npm run demo:seed-owner-payroll
import "dotenv/config";
import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../core/db/connection.js";
import { budgets, payrollBatches } from "../core/db/schema/finance.js";
import { employees } from "../core/db/schema/employees.js";
import { payroll, payrollBatchDecisions } from "../core/db/schema/payroll.js";
import { users } from "../core/db/schema/users.js";
import { refreshMonth } from "../modules/finance/cash-flow/service.js";
import { monthKey } from "../modules/finance/cash-flow/months.js";
import { computeLine, getRules, round2 } from "../modules/workforce/payroll/engine.js";
import { DEMO_PROJECTS } from "./demo-projects.js";
import { assertDemoDatabase } from "./demo-guard.js";
import { addDays, TODAY } from "./demo-seed-lib.js";

const DRY = process.argv.includes("--dry-run");

const WEEKS = 8;
const HIGH_OVERTIME_WEEK = 5; // 1-based week with the overtime spike
const PENDING_AGE_DAYS = 5; // older than the 3-day alert threshold
const DAY_MS = 86_400_000;

/** mulberry32 — fixed seed, so a fresh seed gives the same hours every time. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (start: string, end: string) => {
  const [sy, sm, sd] = start.split("-").map(Number) as [number, number, number];
  const [ey, em, ed] = end.split("-").map(Number) as [number, number, number];
  const head = `${MONTHS[sm - 1]} ${sd}`;
  const tail = sm === em ? `${ed}` : `${MONTHS[em - 1]} ${ed}`;
  return sy === ey ? `${head}–${tail}, ${ey}` : `${head}, ${sy}–${tail}, ${ey}`;
};

/** Most recent Sunday strictly before today (Manila date). */
const lastSunday = (): string => {
  let d = addDays(TODAY, -1);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) d = addDays(d, -1);
  return d;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type EmployeeRow = typeof employees.$inferSelect;

interface Plan {
  id: string;
  projectCode: string;
  group: string;
  status: "approved" | "pending" | "revision_required" | "draft";
  start: string;
  end: string;
  crew: EmployeeRow[];
  /** Regular hours, and the share of the crew working overtime. */
  hours: (i: number) => number;
  overtime: (i: number) => number;
  createdAt: Date;
  submittedAt: Date | null;
  reviewedAt: Date | null;
}

const at = (iso: string, hour = 9) => new Date(`${iso}T${String(hour).padStart(2, "0")}:00:00+08:00`);
const clampNow = (d: Date) => (d.getTime() > Date.now() ? new Date() : d);

async function pickCrew(site: string, taken: Set<string>, want: number): Promise<EmployeeRow[]> {
  const rows = await db
    .select()
    .from(employees)
    .where(and(eq(employees.status, "Active"), sql`${employees.userId} IS NULL`))
    .orderBy(employees.employeeId);
  const own = rows.filter((e) => e.site === site && !taken.has(e.employeeId));
  const rest = rows.filter((e) => e.site !== site && !taken.has(e.employeeId));
  return [...own, ...rest].slice(0, want);
}

async function buildPlans(): Promise<Plan[]> {
  const plans: Plan[] = [];
  const end0 = lastSunday();
  const rand = rng(48113);
  const name = (code: string) => DEMO_PROJECTS.find((p) => p.code === code)!.name;

  const approvedProjects = [
    { code: "DEMO-S4", tag: "S4", group: "Site Crew A", base: 10, growEvery: 2 },
    { code: "DEMO-S5", tag: "S5", group: "Site Crew B", base: 8, growEvery: 3 },
    { code: "DEMO-S6", tag: "S6", group: "Finishing Crew", base: 6, growEvery: 3 },
  ];

  for (const p of approvedProjects) {
    const fullCrew = await pickCrew(name(p.code), new Set(), p.base + Math.ceil(WEEKS / p.growEvery));
    for (let w = 1; w <= WEEKS; w++) {
      const end = addDays(end0, -7 * (WEEKS - w));
      const start = addDays(end, -6);
      const size = Math.min(fullCrew.length, p.base + Math.floor((w - 1) / p.growEvery));
      const highOt = w === HIGH_OVERTIME_WEEK;
      plans.push({
        id: `PAY-OWN-${p.tag}-W${w}`,
        projectCode: p.code,
        group: p.group,
        status: "approved",
        start,
        end,
        crew: fullCrew.slice(0, size),
        hours: () => 40 + Math.floor(rand() * 9),
        // Normal weeks: a few people on short overtime. High week: everyone.
        overtime: () => (highOt ? 9 + Math.floor(rand() * 6) : rand() < 0.25 ? 2 + Math.floor(rand() * 4) : 0),
        createdAt: clampNow(at(addDays(end, 1))),
        submittedAt: clampNow(at(addDays(end, 1), 10)),
        reviewedAt: clampNow(at(addDays(end, 3), 14)),
      });
    }
  }

  // DEMO-S3: the other three states (it has no approved payroll of its own).
  const s3 = await pickCrew(name("DEMO-S3"), new Set(), 8);
  const now = Date.now();
  const mk = (id: string, status: Plan["status"], weeksBack: number, submitted: number | null, reviewed: number | null): Plan => {
    const end = addDays(end0, -7 * weeksBack);
    return {
      id,
      projectCode: "DEMO-S3",
      group: "Pre-construction Crew",
      status,
      start: addDays(end, -6),
      end,
      crew: s3,
      hours: () => 40 + Math.floor(rand() * 9),
      overtime: () => (rand() < 0.25 ? 2 + Math.floor(rand() * 4) : 0),
      createdAt: new Date(now - ((submitted ?? 1) + 1) * DAY_MS),
      submittedAt: submitted === null ? null : new Date(now - submitted * DAY_MS),
      reviewedAt: reviewed === null ? null : new Date(now - reviewed * DAY_MS),
    };
  };
  plans.push(mk("PAY-OWN-S3-PENDING", "pending", 1, PENDING_AGE_DAYS, null));
  plans.push(mk("PAY-OWN-S3-REVISION", "revision_required", 2, 9, 7));
  plans.push(mk("PAY-OWN-S3-DRAFT", "draft", 0, null, null));
  return plans;
}

async function insertPlan(tx: Tx, plan: Plan, finance: string): Promise<{ batchId: string; employerCost: number }> {
  const rules = getRules(plan.end);
  const label_ = label(plan.start, plan.end);
  const lineStatus = plan.status === "approved" ? "Completed" : "Pending";

  const lines = plan.crew.map((e, i) => {
    const regular = plan.hours(i);
    const overtime = plan.overtime(i);
    const c = computeLine(
      { payRate: Number(e.payRate), rateType: e.rateType, regularHours: regular, overtimeHours: overtime, adjustments: 0 },
      rules,
    );
    return { e, regular, overtime, c };
  });
  const sum = (pick: (l: (typeof lines)[number]) => number) => round2(lines.reduce((a, l) => a + pick(l), 0));
  const totals = {
    overtimeHours: sum((l) => l.overtime),
    gross: sum((l) => l.c.gross),
    deductions: sum((l) => l.c.deductions),
    net: sum((l) => l.c.net),
    employerCost: sum((l) => l.c.employerCost),
  };

  await tx.insert(payrollBatches).values({
    id: plan.id,
    projectCode: plan.projectCode,
    period: label_,
    group: plan.group,
    employees: lines.length,
    overtimeHours: totals.overtimeHours,
    grossPayroll: totals.gross,
    deductions: totals.deductions,
    netPayroll: totals.net,
    employerCost: totals.employerCost,
    status: plan.status,
    reviewedBy: plan.reviewedAt ? finance : null,
    reviewedAt: plan.reviewedAt,
    reviewNote:
      plan.status === "revision_required"
        ? "Overtime hours do not match the verified attendance for this period; please regenerate."
        : null,
    round: 1,
    submittedAt: plan.submittedAt,
    createdAt: plan.createdAt,
  });

  await tx.insert(payroll).values(
    lines.map(({ e, regular, overtime, c }) => ({
      batchId: plan.id,
      empId: e.employeeId,
      name: e.name,
      initials: e.initials,
      role: e.role,
      hours: regular,
      overtime,
      adjustments: "0",
      gross: c.gross.toFixed(2),
      sss: c.sss.toFixed(2),
      philhealth: c.philhealth.toFixed(2),
      pagibig: c.pagibig.toFixed(2),
      deductions: c.deductions.toFixed(2),
      net: c.net.toFixed(2),
      employerSss: c.employerSss.toFixed(2),
      employerEc: c.employerEc.toFixed(2),
      employerPhilhealth: c.employerPhilhealth.toFixed(2),
      employerPagibig: c.employerPagibig.toFixed(2),
      employerCost: c.employerCost.toFixed(2),
      rateVersions: { ...c.versions },
      status: lineStatus,
      period: label_,
      periodStart: plan.start,
      periodEnd: plan.end,
      createdAt: plan.createdAt,
    })),
  );

  if (plan.status === "approved" || plan.status === "revision_required") {
    await tx.insert(payrollBatchDecisions).values({
      batchId: plan.id,
      round: 1,
      action: plan.status === "approved" ? "approved" : "rejected",
      reasonCode: plan.status === "approved" ? null : "incorrect_overtime",
      comment:
        plan.status === "approved"
          ? null
          : "Overtime hours do not match the verified attendance for this period; please regenerate.",
      decidedBy: finance,
      decidedAt: plan.reviewedAt!,
    });
  }

  if (plan.status === "approved") {
    // Same booking as payroll/service.ts decideBatch.
    const [budget] = await tx
      .select()
      .from(budgets)
      .where(and(eq(budgets.project, plan.projectCode), eq(budgets.category, "Labor")))
      .orderBy(desc(budgets.createdAt))
      .limit(1);
    if (budget) {
      await tx
        .update(budgets)
        .set({ actual: sql`${budgets.actual} + ${totals.employerCost}`, updatedAt: new Date() })
        .where(eq(budgets.id, budget.id));
    }
  }
  return { batchId: plan.id, employerCost: totals.employerCost };
}

async function main() {
  assertDemoDatabase();
  const plans = await buildPlans();
  const [fin] = await db.select({ name: users.name }).from(users).where(eq(users.email, "finance@easyconstruct.demo"));
  const finance = fin?.name ?? "Finance Manager";

  const existing = new Set(
    (await db.select({ id: payrollBatches.id }).from(payrollBatches)).map((r) => r.id),
  );
  const todo = plans.filter((p) => !existing.has(p.id));
  const thin = todo.filter((p) => p.crew.length < 3);
  if (thin.length) throw new Error(`Not enough active employees to staff: ${thin.map((p) => p.id).join(", ")}`);

  console.log(`Plan: ${todo.length} new batch(es), ${plans.length - todo.length} already present.`);
  for (const p of todo) console.log(`  ${p.id}  ${p.projectCode}  ${p.status.padEnd(17)} ${label(p.start, p.end)}  ${p.crew.length} employees`);
  if (DRY || todo.length === 0) {
    console.log(DRY ? "\nDry run — nothing written." : "\nNothing to do.");
    return;
  }

  const months = new Set<string>();
  const created = await db.transaction(async (tx) => {
    const out: { batchId: string; employerCost: number }[] = [];
    for (const p of todo) {
      out.push(await insertPlan(tx, p, finance));
      if (p.status === "approved" && p.reviewedAt) months.add(monthKey(p.reviewedAt));
    }
    // An approval is cash out: refresh those months of the cash flow, as a real approval does.
    for (const m of months) await refreshMonth(m, tx);
    return out;
  });
  console.log(`\nCreated ${created.length} batch(es); refreshed cash flow for ${[...months].sort().join(", ") || "no months"}.`);
}

main()
  .catch((e) => {
    console.error("\n✘ demo-seed-owner-payroll failed:", e.message);
    process.exitCode = 1;
  })
  .finally(() => setTimeout(() => process.exit(process.exitCode ?? 0), 250));
