// Real-database test (npm run test:db): TC5 B-129/B-179/B-180 — a "Budget
// Change Request" workflow never got a budgetId, so a full approval had
// nowhere to apply the delta (syncLinkedBudgetChange in service.ts silently
// no-oped). resolveBudgetIdForLineItems is the fix: it finds the one
// existing (project, category) budget row the submitted line items name,
// the same best-effort match expenses/payroll already use elsewhere.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { budgets, expenseCategories } from "../../../core/db/schema/finance.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import { getBudgetBaseline, resolveBudgetIdForLineItems } from "./service.js";

const tag = `DBC${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;
const categoryName = `Test Category ${tag}`;

let budgetId: number;

describe("resolveBudgetIdForLineItems", () => {
  before(async () => {
    assertDemoDatabase();
    await db.insert(projects).values({ name: "Budget sync test", code: P, pm: "Test", due: "2099-12-31", status: "Construction" });
    const [category] = await db
      .insert(expenseCategories)
      .values({ name: categoryName, sortOrder: 9999, createdBy: "Test" })
      .returning();
    const [budget] = await db
      .insert(budgets)
      .values({ project: P, category: categoryName, owner: "Test", planned: 1000, fiscalYear: "2026" })
      .returning();
    budgetId = budget!.id;
    void category;
  });

  after(async () => {
    await db.delete(budgets).where(eq(budgets.id, budgetId));
    await db.delete(expenseCategories).where(eq(expenseCategories.name, categoryName));
    await db.delete(projects).where(eq(projects.code, P));
    await db.$client.end();
  });

  test("matches the project's budget by category, case-insensitively", async () => {
    const found = await resolveBudgetIdForLineItems(P, [{ category: categoryName.toLowerCase() }]);
    assert.equal(found, budgetId);
  });

  test("a mixed-category request resolves to no budget (today's behavior, not a regression)", async () => {
    const found = await resolveBudgetIdForLineItems(P, [
      { category: categoryName.toLowerCase() },
      { category: "materials" },
    ]);
    assert.equal(found, null);
  });

  test("an unknown category, or no line items, resolves to no budget", async () => {
    assert.equal(await resolveBudgetIdForLineItems(P, [{ category: "not-a-real-category" }]), null);
    assert.equal(await resolveBudgetIdForLineItems(P, undefined), null);
    assert.equal(await resolveBudgetIdForLineItems(P, []), null);
  });
  test("B-136: the baseline is the budget's planned amount, or null when there is no budget", async () => {
    assert.deepEqual(await getBudgetBaseline(P, categoryName.toLowerCase()), { budgetId, planned: 1000 });
    assert.equal(await getBudgetBaseline(P, "not-a-real-category"), null);
  });
});
