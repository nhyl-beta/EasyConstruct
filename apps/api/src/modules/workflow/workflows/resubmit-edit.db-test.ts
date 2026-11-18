// Real-database test (npm run test:db): resubmitStage can now carry an
// edited title and/or line items, instead of only resending the request
// exactly as it was sent back (the bug sheet's "no modal to edit" finding).
// Fixtures live under a throwaway project code and are removed in after().
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { users } from "../../../core/db/schema/users.js";
import { budgets } from "../../../core/db/schema/finance.js";
import { workflows, workflowStages } from "../../../core/db/schema/workflows.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import * as repo from "./repository.js";
import * as service from "./service.js";

const tag = `RSB${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;

type Who = { id: number; name: string; role: string };
let engineer: Who, finance: Who;
let workflowId: number;

const who = async (role: string): Promise<Who> => {
  const [row] = await db.select().from(users).where(eq(users.role, role)).limit(1);
  assert.ok(row, `a ${role} user must exist`);
  return { id: row!.id, name: row!.name, role };
};

describe("resubmitStage with edits", () => {
  before(async () => {
    assertDemoDatabase();
    engineer = await who("engineer");
    finance = await who("finance-manager");
    await db.insert(projects).values({ name: "Resubmit edit test", code: P, pm: finance.name, pmUserId: finance.id, due: "2099-12-31", status: "Construction" });
    // A budget change needs a budget to change; submitting without one is refused (B-129/B-134).
    await db.insert(budgets).values({ project: P, category: "Materials", owner: finance.name, planned: 1000, fiscalYear: "2026" });
    const template = (await repo.findAllTemplates()).find((t) => t.name === "Budget Change Request");
    assert.ok(template, "the Budget Change Request template must be seeded");

    const created = await service.createWorkflow(
      {
        title: `Budget change ${tag}`,
        projectCode: P,
        templateId: template!.id,
        type: "Budget Change Request",
        lineItems: [{ category: "materials", description: "Original line", currentAmount: 1000, requestedAmount: 1500 }],
      },
      engineer.name,
      engineer.role,
      engineer.id,
    );
    workflowId = created.id;

    // Finance sends the first (currently waiting) stage back for revision.
    const [current] = (await repo.findStagesByWorkflow(workflowId)).filter((s) => s.status === "current");
    assert.ok(current, "a stage must be waiting on Finance");
    await service.decideStage(workflowId, current!.id, { decision: "revise", decidedBy: finance.name, comments: "Fix the numbers" }, finance.role);
  });

  after(async () => {
    await db.delete(workflowStages).where(eq(workflowStages.workflowId, workflowId));
    await db.delete(workflows).where(eq(workflows.id, workflowId));
    await db.delete(budgets).where(eq(budgets.project, P));
    await db.delete(projects).where(eq(projects.code, P));
  });

  test("resubmit with an edited title and replaced line items updates both, and reopens the stage", async () => {
    const [stage] = (await repo.findStagesByWorkflow(workflowId)).filter((s) => s.status === "revision-required");
    assert.ok(stage, "the stage must be revision-required before resubmitting");

    const updated = await service.resubmitStage(
      workflowId,
      stage!.id,
      {
        title: `Budget change ${tag} (revised)`,
        lineItems: [{ category: "labor", description: "Corrected line", currentAmount: 1000, requestedAmount: 1800 }],
      },
      { role: engineer.role, name: engineer.name },
    );

    assert.equal(updated.title, `Budget change ${tag} (revised)`);
    assert.equal(updated.lineItems.length, 1);
    assert.equal(updated.lineItems[0]!.description, "Corrected line");
    assert.equal(updated.lineItems[0]!.category, "labor");
    assert.equal(Number(updated.amount), 800); // 1800 - 1000, recomputed from the new line
    assert.equal(updated.stages.find((s) => s.id === stage!.id)!.status, "current");
  });

  test("resubmit with no edits (plain {}) behaves exactly as before — nothing is touched", async () => {
    // Send it back for revision again so there is a revision-required stage to resubmit.
    const [current] = (await repo.findStagesByWorkflow(workflowId)).filter((s) => s.status === "current");
    assert.ok(current, "a stage must be waiting again");
    await service.decideStage(workflowId, current!.id, { decision: "revise", decidedBy: finance.name }, finance.role);
    const [revising] = (await repo.findStagesByWorkflow(workflowId)).filter((s) => s.status === "revision-required");
    assert.ok(revising);

    const before = await service.getWorkflowById(workflowId);
    const after = await service.resubmitStage(workflowId, revising!.id, {}, { role: engineer.role, name: engineer.name });

    assert.equal(after.title, before.title);
    assert.deepEqual(
      after.lineItems.map((li) => li.description),
      before.lineItems.map((li) => li.description),
    );
    assert.equal(after.stages.find((s) => s.id === revising!.id)!.status, "current");
  });
});
