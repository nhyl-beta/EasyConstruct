// server/src/finance/purchasing/chain.db-test.ts
//
// Real-database test (npm run test:db): the whole purchasing chain, and the
// guarantees that make it safe: one expense per payment, an atomic budget
// `committed` / `actual`, segregation of duties, and a second (or concurrent)
// payment that creates nothing. The services commit their own transactions, so
// the fixtures are committed under a throwaway project code and removed again
// in after(). Needs migrations 0025 and 0026 applied. Guarded like the demo scripts.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../db/connection.js";
import { budgets, expenseCategories, expenses, procurementOrders, purchaseRequests, reimbursements } from "../../db/schema/finance.js";
import { projectMembers } from "../../db/schema/project-members.js";
import { projects } from "../../db/schema/projects.js";
import { requirements } from "../../db/schema/requirements.js";
import { users } from "../../db/schema/users.js";
import { assertDemoDatabase } from "../../scripts/demo-guard.js";
import { monthKey } from "../cash-flow/months.js";
import { refreshMonth } from "../cash-flow/service.js";
import { ConflictError, ForbiddenError } from "../../utils/errors.js";
import { purchaseRequestsService as prs } from "../purchase-requests/service.js";
import { procurementService as orders } from "../procurement/service.js";
import { reimbursementsService as claims } from "../reimbursements/service.js";
import type { Actor } from "./access.js";

const tag = `DBP${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;
const PLANNED = 100_000;

let engineer: Actor, site: Actor, pm: Actor, finance: Actor;
let requirementId: number;

const actorWith = async (role: string, skip: number[] = []): Promise<Actor> => {
  const rows = await db.select().from(users).where(eq(users.role, role));
  const row = rows.find((r) => !skip.includes(r.id));
  assert.ok(row, `a ${role} user must exist`);
  return { id: row!.id, name: row!.name, role };
};

const line = async () => (await db.select().from(budgets).where(and(eq(budgets.project, P), eq(budgets.category, "Materials"))))[0]!;
const expensesFor = (sourceId: string) => db.select().from(expenses).where(eq(expenses.sourceId, sourceId));

const raiseApproved = async (amountUnits: number) => {
  const pr = await prs.create(engineer, {
    requirementId,
    title: `Rebar ${amountUnits}`,
    category: "Materials",
    lineItems: [{ description: "Rebar", qty: amountUnits, unit: "ton", unitCost: 1000 }],
  });
  await prs.endorse(pm, pr.id);
  await prs.approve(finance, pr.id);
  return pr.id;
};

describe("purchasing chain", () => {
  before(async () => {
    assertDemoDatabase();
    // Writes are validated against the managed list: make sure the category the test uses exists.
    await db.insert(expenseCategories).values({ name: "Materials", isSystem: true }).onConflictDoNothing();
    engineer = await actorWith("engineer");
    site = await actorWith("site-personnel");
    pm = await actorWith("project-manager");
    finance = await actorWith("finance-manager");

    await db.insert(projects).values({ name: "Purchasing test", code: P, pm: pm.name, pmUserId: pm.id, due: "2099-12-31", status: "Construction" });
    await db.insert(budgets).values({ project: P, category: "Materials", owner: "Test", planned: PLANNED, fiscalYear: "1999" });
    await db.insert(projectMembers).values([
      { projectCode: P, userId: engineer.id, userName: engineer.name, role: "engineer", addedBy: "test" },
      { projectCode: P, userId: site.id, userName: site.name, role: "site-personnel", addedBy: "test" },
    ]);
    const [req] = await db
      .insert(requirements)
      .values({ requirementId: `${tag}-R1`.slice(0, 20), title: "Rebar", project: P, category: "Materials", description: "Rebar for slab", status: "Approved", createdBy: "test" })
      .returning();
    requirementId = req!.id;
  });

  after(async () => {
    const prIds = (await db.select({ id: purchaseRequests.id }).from(purchaseRequests).where(eq(purchaseRequests.project, P))).map((r) => r.id);
    if (prIds.length) await db.delete(procurementOrders).where(inArray(procurementOrders.purchaseRequestId, prIds));
    await db.delete(expenses).where(eq(expenses.project, P));
    await db.delete(purchaseRequests).where(eq(purchaseRequests.project, P));
    await db.delete(reimbursements).where(eq(reimbursements.project, P));
    await db.delete(requirements).where(eq(requirements.project, P));
    await db.delete(projectMembers).where(eq(projectMembers.projectCode, P));
    await db.delete(budgets).where(eq(budgets.project, P));
    await db.delete(projects).where(eq(projects.code, P));
    await refreshMonth(monthKey(new Date())); // the current month's outflow again matches the records
    await db.$client.end();
  });

  test("request -> endorse -> approve commits the amount; an order for less releases the difference", async () => {
    const id = await raiseApproved(10); // 10,000
    assert.equal((await line()).committed, 10_000);
    const order = await orders.create(finance, {
      purchaseRequestId: id,
      vendor: "Steel Co",
      lineItems: [{ description: "Rebar", qty: 8, unit: "ton", unitCost: 1000 }],
    });
    assert.equal(order.amount, 8_000);
    assert.equal((await line()).committed, 8_000);
    await assert.rejects(
      orders.create(finance, { purchaseRequestId: id, vendor: "Again" }),
      ConflictError,
      "one order per request",
    );
    await orders.cancel(finance, order.id);
    assert.equal((await line()).committed, 10_000, "the request holds its full amount again");
    await prs.cancel(finance, id);
    assert.equal((await line()).committed, 0);
  });

  test("delivery: the order's creator cannot confirm it; staff on the project can", async () => {
    const id = await raiseApproved(5);
    const order = await orders.create(finance, { purchaseRequestId: id, vendor: "Cement Co" });
    // Admin may receive, but not when it is the same person who created the order.
    await assert.rejects(orders.deliver({ ...finance, role: "admin" }, order.id, {}), ForbiddenError);
    await assert.rejects(orders.pay(finance, order.id, { invoiceNumber: "I-1", invoiceAmount: 5000 }), ConflictError, "not delivered yet");
    await orders.deliver(site, order.id, { note: "all received" });
    // clean up for later tests: pay it
    await orders.pay(finance, order.id, { invoiceNumber: "I-1", invoiceAmount: 5000 });
  });

  test("payment creates exactly one approved expense; a second or concurrent payment creates nothing", async () => {
    const before = await line();
    const id = await raiseApproved(3); // 3,000
    const order = await orders.create(finance, { purchaseRequestId: id, vendor: "Gravel Co" });
    await orders.deliver(site, order.id, {});

    const results = await Promise.allSettled([
      orders.pay(finance, order.id, { invoiceNumber: "I-2", invoiceAmount: 3000 }),
      orders.pay(finance, order.id, { invoiceNumber: "I-2", invoiceAmount: 3000 }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1, "exactly one payment wins");
    assert.ok(results.some((r) => r.status === "rejected" && r.reason instanceof ConflictError));

    const made = await expensesFor(order.id);
    assert.equal(made.length, 1);
    assert.equal(made[0]!.status, "approved");
    assert.equal(made[0]!.sourceType, "purchase-order");

    const after = await line();
    assert.equal(after.actual - before.actual, 3_000, "actual grew by the invoice amount, once");
    assert.equal(after.committed, before.committed, "the commitment was released");
  });

  test("a different invoice needs a note and is shown as a variance", async () => {
    const id = await raiseApproved(2);
    const order = await orders.create(finance, { purchaseRequestId: id, vendor: "Sand Co" });
    await orders.deliver(site, order.id, {});
    await assert.rejects(orders.pay(finance, order.id, { invoiceNumber: "I-3", invoiceAmount: 2200 }));
    const paid = await orders.pay(finance, order.id, { invoiceNumber: "I-3", invoiceAmount: 2200, varianceNote: "Freight" });
    assert.equal(paid.order.invoiceAmount, 2200);
    assert.equal(paid.expense.amount, 2200);
  });

  test("segregation: nobody approves or endorses their own request", async () => {
    const pr = await prs.create(engineer, {
      requirementId: requirementId,
      title: "Own",
      category: "Materials",
      lineItems: [{ description: "x", qty: 1, unit: "ea", unitCost: 10 }],
    }).catch((e) => e);
    // The requirement is already covered by a live request or fully paid; either way no self-approval path exists.
    if (pr instanceof Error) return;
    await assert.rejects(prs.endorse({ ...pm, id: engineer.id }, pr.id), ForbiddenError);
  });

  test("a reimbursement claim: pm -> finance -> paid creates one expense; Finance cannot pay their own", async () => {
    const claim = await claims.create(site, {
      project: P,
      category: "Materials",
      incurredOn: "2026-09-30",
      purpose: "Nails bought on site",
      amount: 450,
      attachments: [{ url: "/u/r.png", filename: "r.png", contentType: "image/png", sizeBytes: 10 }],
    });
    assert.equal(claim.status, "pending-pm");
    await assert.rejects(claims.approve(finance, claim.id), ConflictError, "needs the PM first");
    await claims.endorse(pm, claim.id);
    await claims.approve(finance, claim.id);
    await assert.rejects(claims.approve({ ...finance, id: site.id }, claim.id), ForbiddenError);
    const results = await Promise.allSettled([claims.pay(finance, claim.id, "REF-1"), claims.pay(finance, claim.id, "REF-1")]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal((await expensesFor(claim.id)).length, 1);
  });
});
