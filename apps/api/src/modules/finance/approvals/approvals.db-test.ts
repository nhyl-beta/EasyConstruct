// apps/api/src/finance/approvals/approvals.db-test.ts
//
// Real-database test for the Finance "waiting on you" list (npm run test:db).
// Rows are written in ONE transaction that is rolled back, so nothing persists.
// Guarded like the demo scripts.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { budgets, expenses, payrollBatches } from "../../../core/db/schema/finance.js";
import { assertDemoDatabase } from "../../../scripts/demo-guard.js";
import { approvalsService } from "./service.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
class Rollback extends Error {}
const inRollback = (fn: (tx: Tx) => Promise<void>) =>
  db
    .transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const P = "ZZTEST-APPR";
const tag = `DBA${Date.now().toString(36)}`;

async function seed(tx: Tx) {
  const exp = (n: number, status: string, h: number, amount: number) => ({
    id: `${tag}-E${n}`, vendor: "Test vendor", project: P, category: "Materials", amount, submittedAt: hoursAgo(h), status,
  });
  await tx.insert(expenses).values([exp(1, "pending", 10, 1000), exp(2, "pending", 3, 2000), exp(3, "approved", 99, 5), exp(4, "rejected", 98, 6)]);
  const batch = (n: number, status: string, h: number, employerCost: number, gross: number) => ({
    id: `${tag}-B${n}`, projectCode: P, period: "Test period", group: "Crew", employees: 1,
    grossPayroll: gross, netPayroll: gross, employerCost, status, createdAt: hoursAgo(h), submittedAt: hoursAgo(h),
  });
  await tx.insert(payrollBatches).values([batch(1, "pending", 20, 2400, 2000), batch(2, "pending", 5, 0, 1800), batch(3, "approved", 90, 1, 1), batch(4, "draft", 80, 1, 1)]);
  const bud = (status: "finance-review" | "draft" | "approved") => ({ project: P, category: `Cat-${status}`, owner: "Test owner", planned: 5000, fiscalYear: "2026", status });
  await tx.insert(budgets).values([bud("finance-review"), bud("draft"), bud("approved")]);
  // Make the finance-review budget the oldest of ours.
  await tx.update(budgets).set({ updatedAt: hoursAgo(60) }).where(eq(budgets.category, "Cat-finance-review"));
}

describe("Finance approvals list against the database", () => {
  before(() => assertDemoDatabase());
  after(async () => {
    await db.$client.end();
  });

  test("only what is waiting on Finance, oldest first, with the right amounts", () =>
    inRollback(async (tx) => {
      await seed(tx);
      const { items } = await approvalsService.list(100_000, now, tx);
      const mine = items.filter((i) => i.reference.includes(P) || i.id.startsWith(`exp-${tag}`) || i.id.startsWith(`pay-${tag}`));
      assert.deepEqual(
        mine.map((i) => [i.kind, i.amount]),
        [["Budget", 5000], ["Payroll", 2400], ["Expense", 1000], ["Payroll", 1800], ["Expense", 2000]],
      );
      assert.ok(mine.every((i) => i.status === "pending" && i.waitingHours >= 0));
      assert.deepEqual(mine.map((i) => i.href), ["/budget", "/payroll-review", "/expenses", "/payroll-review", "/expenses"]);
    }));

  test("Expense rows equal pending expenses and Payroll rows equal pending batches (the Pending payroll KPI)", () =>
    inRollback(async (tx) => {
      await seed(tx);
      const { items, total } = await approvalsService.list(100_000, now, tx);
      const count = async (table: "expenses" | "payroll_batches") =>
        Number((await tx.execute(sql`select count(*)::int as n from ${sql.raw(table)} where status = 'pending'`)).rows[0]!.n);
      assert.equal(items.filter((i) => i.kind === "Expense").length, await count("expenses"));
      assert.equal(items.filter((i) => i.kind === "Payroll").length, await count("payroll_batches"));
      assert.equal(total, items.length);
    }));

  test("the limit truncates the list but not the total", () =>
    inRollback(async (tx) => {
      await seed(tx);
      const all = await approvalsService.list(100_000, now, tx);
      const two = await approvalsService.list(2, now, tx);
      assert.equal(two.items.length, 2);
      assert.equal(two.total, all.total);
    }));
});
