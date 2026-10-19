// apps/api/src/finance/cash-flow/sources.db-test.ts
//
// Real-database tests for the cash-out queries (npm run test:db). Every row is
// written inside ONE transaction that is rolled back, in 1999 months no real
// record uses, so nothing persists. Guarded like the demo scripts.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";

import { db } from "../../core/db/connection.js";
import { expenses, payrollBatches } from "../../core/db/schema/finance.js";
import { payrollBatchDecisions } from "../../core/db/schema/payroll.js";
import { assertDemoDatabase } from "../../scripts/demo-guard.js";
import { refreshMonth } from "./service.js";
import { expenseOutflowByMonth, payrollOutflowByMonth, projectCosts } from "./sources.js";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
class Rollback extends Error {}

/** Runs `fn` in a transaction that is always rolled back. */
const inRollback = (fn: (tx: Tx) => Promise<void>) =>
  db
    .transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((e) => {
      if (!(e instanceof Rollback)) throw e;
    });

const JAN = "1999-01"; // only expenses
const FEB = "1999-02"; // only payroll
const MAR = "1999-03"; // empty: nothing that counts as cash
const mid = (key: string) => new Date(`${key}-15T12:00:00Z`);
const P = "ZZTEST-SOURCES";
const tag = `DBT${Date.now().toString(36)}`;

async function seed(tx: Tx) {
  const exp = (n: number, key: string, amount: number, status: string) => ({
    id: `${tag}-E${n}`, vendor: "Test vendor", project: P, category: "Materials", amount, submittedAt: mid(key), status,
  });
  await tx.insert(expenses).values([
    exp(1, JAN, 1000.5, "approved"),
    exp(2, JAN, 499.5, "approved"),
    exp(3, JAN, 777, "pending"),
    exp(4, JAN, 888, "rejected"),
    exp(5, MAR, 50, "rejected"),
    exp(6, MAR, 60, "pending"),
  ]);

  const batch = (n: number, status: string, employerCost: number, grossPayroll: number) => ({
    id: `${tag}-B${n}`, projectCode: P, period: "Test", group: "Test crew", employees: 1,
    grossPayroll, netPayroll: grossPayroll, employerCost, status, createdAt: mid(JAN), submittedAt: mid(JAN),
  });
  await tx.insert(payrollBatches).values([
    batch(1, "approved", 2400, 2000), // submitted in January, approved in February
    batch(2, "approved", 0, 1800), // legacy batch: no employer cost, gross counts
    batch(3, "revision_required", 900, 800), // rejected: never cash
    batch(4, "pending", 700, 600), // undecided
  ]);
  const decision = (n: number, action: string, key: string) => ({ batchId: `${tag}-B${n}`, round: 1, action, decidedBy: "Test", decidedAt: mid(key) });
  await tx.insert(payrollBatchDecisions).values([decision(1, "approved", FEB), decision(2, "approved", FEB), decision(3, "rejected", FEB)]);
}

describe("cash-out queries against the database", () => {
  before(() => {
    assertDemoDatabase();
  });
  after(async () => {
    await db.$client.end();
  });

  test("approved expenses count in their submission month; pending and rejected never do", () =>
    inRollback(async (tx) => {
      await seed(tx);
      const e = await expenseOutflowByMonth(tx);
      assert.equal(e.get(JAN), 1500);
      assert.equal(e.get(FEB), undefined);
      assert.equal(e.get(MAR), undefined);
    }));

  test("approved payroll counts in the approving decision's month, employer cost or gross for legacy", () =>
    inRollback(async (tx) => {
      await seed(tx);
      const p = await payrollOutflowByMonth(tx);
      assert.equal(p.get(FEB), 4200);
      assert.equal(p.get(JAN), undefined, "batch creation/submission month must not count");
      assert.equal(p.get(MAR), undefined);
    }));

  test("the monthly rollup: expenses-only, payroll-only and empty months", () =>
    inRollback(async (tx) => {
      await seed(tx);
      assert.equal(await refreshMonth(JAN, tx), 1500);
      assert.equal(await refreshMonth(FEB, tx), 4200);
      assert.equal(await refreshMonth(MAR, tx), 0);
    }));

  test("project cost is approved expenses plus approved payroll", () =>
    inRollback(async (tx) => {
      await seed(tx);
      assert.equal((await projectCosts(tx)).get(P), 5700);
    }));
});
