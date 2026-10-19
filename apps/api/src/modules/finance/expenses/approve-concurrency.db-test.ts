// apps/api/src/finance/expenses/approve-concurrency.db-test.ts
//
// Real-database test (npm run test:db): approvals fired at the same time must
// not lose an update — neither on the budget line's `actual` nor on the
// month's cash flow outflow. The service commits its own transactions, so the
// fixtures are committed under a throwaway project code in 1999 months and
// removed again in after(). Guarded like the demo scripts.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq, like } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { budgets, cashFlowEntries, expenses } from "../../../core/db/schema/finance.js";
import { projects } from "../../../core/db/schema/projects.js";
import { assertDemoDatabase } from "../../../scripts/demo-guard.js";
import { keyToLabel } from "../cash-flow/months.js";
import { expensesService } from "./services.js";

const tag = `DBT${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;
const START = 1000;
const MONTHS = ["1999-04", "1999-05", "1999-06", "1999-07"];

const budgetActual = async (category: string) =>
  Number((await db.select().from(budgets).where(and(eq(budgets.project, P), eq(budgets.category, category))))[0]!.actual);
const outflow = async (key: string) =>
  Number((await db.select().from(cashFlowEntries).where(eq(cashFlowEntries.month, keyToLabel(key))))[0]?.outflow ?? NaN);

let n = 0;
const pending = async (category: string, amount: number, key: string) => {
  const id = `${tag}-${++n}`;
  await db.insert(expenses).values({
    id, vendor: "Test vendor", project: P, category, amount, submittedAt: new Date(`${key}-15T12:00:00Z`), status: "pending",
  });
  return id;
};

describe("concurrent expense approvals", () => {
  before(async () => {
    assertDemoDatabase();
    const taken = await db.select().from(cashFlowEntries).where(like(cashFlowEntries.month, "% 1999"));
    assert.equal(taken.length, 0, "1999 cash flow months must be unused before this test");
    await db.insert(projects).values({ name: "Concurrency test", code: P, pm: "Test", due: "2099-12-31", status: "Construction" });
    await db.insert(budgets).values([
      { project: P, category: "Materials", owner: "Test", planned: 100_000, actual: START, fiscalYear: "1999" },
      { project: P, category: "Labor", owner: "Test", planned: 100_000, actual: START, fiscalYear: "1999" },
    ]);
  });

  after(async () => {
    await db.delete(expenses).where(eq(expenses.project, P));
    await db.delete(budgets).where(eq(budgets.project, P));
    await db.delete(projects).where(eq(projects.code, P));
    await db.delete(cashFlowEntries).where(like(cashFlowEntries.month, "% 1999"));
    await db.$client.end();
  });

  test("two approvals on the same budget line: actual = start + both amounts", async () => {
    const a = await pending("Materials", 250, MONTHS[0]!);
    const b = await pending("Materials", 125, MONTHS[0]!);
    await Promise.all([expensesService.approve(a), expensesService.approve(b)]);
    assert.equal(await budgetActual("Materials"), START + 250 + 125);
    assert.equal(await outflow(MONTHS[0]!), 375);
  });

  test("approvals on different lines in the same month: the month's outflow keeps both", async () => {
    // Different budget rows, so nothing but the cash flow row is shared.
    for (const key of MONTHS.slice(1)) {
      const a = await pending("Labor", 60, key);
      const b = await pending("Misc (no budget line)", 40, key);
      await Promise.all([expensesService.approve(a), expensesService.approve(b)]);
      assert.equal(await outflow(key), 100, `${keyToLabel(key)} lost an approval`);
    }
    assert.equal(await budgetActual("Labor"), START + 60 * 3);
  });
});
