// Real-database test (npm run test:db): B-129/B-134 end to end. A fully approved Budget Change Request moves the
// budget's planned amount and writes an adjustment row; a request with no matching budget is refused when it is
// submitted; and an older request that was never linked to a budget is still matched when it is approved.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { users } from "../../../core/db/schema/users.js";
import { budgetAdjustments, budgets } from "../../../core/db/schema/finance.js";
import { workflows, workflowStages } from "../../../core/db/schema/workflows.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import * as repo from "./repository.js";
import * as service from "./service.js";

const tag = `BCF${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;

let engineer: { id: number; name: string; role: string };
let templateId: number;
let budgetId: number;
const workflowIds: number[] = [];
const extraBudgetIds: number[] = [];

const raise = async (category: "materials" | "labor", current: number, requested: number, pickedBudgetId?: number) => {
  const created = await service.createWorkflow(
    {
      title: `Budget change ${tag}`,
      projectCode: P,
      templateId,
      type: "Budget Change Request",
      budgetId: pickedBudgetId,
      lineItems: [{ category, description: "Test line", currentAmount: current, requestedAmount: requested }],
    },
    engineer.name,
    engineer.role,
    engineer.id,
  );
  workflowIds.push(created.id);
  return created.id;
};

// Every approver says yes, in order, until no stage is waiting.
const approveAll = async (workflowId: number) => {
  for (let i = 0; i < 10; i++) {
    const [stage] = (await repo.findStagesByWorkflow(workflowId)).filter((s) => s.status === "current");
    if (!stage) return;
    await service.decideStage(workflowId, stage.id, { decision: "approve", decidedBy: `Approver ${stage.role}`, comments: "ok" }, stage.role);
  }
  assert.fail("the approval chain did not finish");
};

const planned = async () => (await db.select().from(budgets).where(eq(budgets.id, budgetId)))[0]!.planned;

describe("budget change flow", () => {
  before(async () => {
    assertDemoDatabase();
    const [row] = await db.select().from(users).where(eq(users.role, "engineer")).limit(1);
    assert.ok(row, "an engineer user must exist (run db:seed)");
    engineer = { id: row!.id, name: row!.name, role: "engineer" };
    await db.insert(projects).values({ name: "Budget flow test", code: P, pm: engineer.name, pmUserId: engineer.id, due: "2099-12-31", status: "Construction" });
    const template = (await repo.findAllTemplates()).find((t) => t.name === "Budget Change Request");
    assert.ok(template, "the Budget Change Request template must be seeded");
    templateId = template!.id;
    budgetId = (await db.insert(budgets).values({ project: P, category: "Materials", owner: "Test", planned: 1000, fiscalYear: "2026" }).returning())[0]!.id;
  });

  after(async () => {
    for (const id of workflowIds) {
      await db.delete(workflowStages).where(eq(workflowStages.workflowId, id));
      await db.delete(workflows).where(eq(workflows.id, id));
    }
    for (const id of extraBudgetIds) {
      await db.delete(budgetAdjustments).where(eq(budgetAdjustments.budgetId, id));
      await db.delete(budgets).where(eq(budgets.id, id));
    }
    await db.delete(budgetAdjustments).where(eq(budgetAdjustments.budgetId, budgetId));
    await db.delete(budgets).where(eq(budgets.id, budgetId));
    await db.delete(projects).where(eq(projects.code, P));
    await db.$client.end();
  });

  test("a change with no matching budget is refused at submission", async () => {
    await assert.rejects(raise("labor", 0, 500), /no budget/i);
  });

  test("a fully approved change moves the planned amount and writes one adjustment", async () => {
    const id = await raise("materials", 1000, 1500);
    assert.equal(Number(await planned()), 1000, "nothing moves before approval");
    await approveAll(id);
    assert.equal(Number(await planned()), 1500);
    const rows = await db.select().from(budgetAdjustments).where(eq(budgetAdjustments.budgetId, budgetId));
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0]!.adjustmentAmount), 500);
  });

  test("an older request with no budget link is matched when it is approved", async () => {
    const id = await raise("materials", 1500, 1800);
    await db.update(workflows).set({ budgetId: null }).where(eq(workflows.id, id));
    await approveAll(id);
    assert.equal(Number(await planned()), 1800);
  });

  test("with several lines in one category, the picked line is the one that moves", async () => {
    const [newer] = await db.insert(budgets).values({ project: P, category: "Materials", owner: "Test", planned: 80_000, fiscalYear: "2027" }).returning();
    extraBudgetIds.push(newer!.id);
    const [older] = await db.select().from(budgets).where(eq(budgets.id, budgetId));
    const before = Number(older!.planned);
    const id = await raise("materials", 80_000, 85_000, newer!.id);
    await approveAll(id);
    const [moved] = await db.select().from(budgets).where(eq(budgets.id, newer!.id));
    assert.equal(Number(moved!.planned), 85_000);
    assert.equal(Number(await planned()), before, "the other line is untouched");
  });

  test("a budget line from another project is refused", async () => {
    const [other] = await db.insert(budgets).values({ project: `${P}-X`, category: "Materials", owner: "Test", planned: 1, fiscalYear: "2026" }).returning();
    extraBudgetIds.push(other!.id);
    await assert.rejects(raise("materials", 0, 100, other!.id), /different project/);
  });
});
