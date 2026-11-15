// apps/api/src/modules/finance/payments/service.db-test.ts
//
// Real-database test (npm run test:db): recording a client payment books
// straight to cash flow inflow for its month — no approval step, unlike an
// expense. Inflow is company-wide, not per-project, so this asserts the
// DELTA the payment caused rather than the month's absolute total (other
// data may already contribute to the same month), and restores the month by
// re-running refreshMonth after deleting the fixture — never by deleting the
// month's cash_flow_entries row outright, which other data may still need.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { cashFlowEntries, clientPayments } from "../../../core/db/schema/finance.js";
import { projects } from "../../../core/db/schema/projects.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import { keyToLabel, monthKey } from "../cash-flow/months.js";
import { refreshMonth } from "../cash-flow/service.js";
import { clientPaymentsService } from "./service.js";

const tag = `DBT${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;

const inflowOf = async (label: string) =>
  Number((await db.select().from(cashFlowEntries).where(eq(cashFlowEntries.month, label)))[0]?.inflow ?? 0);

describe("recording a client payment", () => {
  before(async () => {
    assertDemoDatabase();
    await db.insert(projects).values({ name: "Payment test", code: P, pm: "Test", due: "2099-12-31", status: "Construction" });
  });

  after(async () => {
    await db.delete(projects).where(eq(projects.code, P));
    await db.$client.end();
  });

  test("books straight to inflow, no approval step, and the delta is exactly the amount", async () => {
    const key = monthKey(new Date());
    const label = keyToLabel(key);
    const inflowBefore = await inflowOf(label);

    const row = await clientPaymentsService.create({ project: P, amount: 7_500 }, "Test");
    assert.equal(row.project, P);
    assert.equal(Number(row.amount), 7_500);
    const inflowAfter = await inflowOf(label);
    assert.equal(Math.round((inflowAfter - inflowBefore) * 100) / 100, 7_500);

    // Clean up the fixture row, then recompute the month so it reflects only
    // whatever was there before this test ran.
    await db.delete(clientPayments).where(eq(clientPayments.id, row.id));
    await refreshMonth(key);
    assert.equal(await inflowOf(label), inflowBefore);
  });

  test("rejects a zero or negative amount before touching the database", async () => {
    await assert.rejects(() => clientPaymentsService.create({ project: P, amount: 0 }, "Test"));
    await assert.rejects(() => clientPaymentsService.create({ project: P, amount: -5 }, "Test"));
  });
});
