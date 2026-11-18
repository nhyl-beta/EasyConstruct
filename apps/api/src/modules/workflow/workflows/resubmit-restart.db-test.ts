// Real-database test (npm run test:db): a revision restarts the whole review. The first stage is
// current again and every later stage is "upcoming", so earlier approvers see the revised version.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { users } from "../../../core/db/schema/users.js";
import { budgets } from "../../../core/db/schema/finance.js";
import { workflows } from "../../../core/db/schema/workflows.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import * as repo from "./repository.js";
import * as service from "./service.js";

const tag = `RSR${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;

describe("resubmitStage restarts the review", () => {
  let workflowId: number;
  const actors: Record<string, { id: number; name: string; role: string }> = {};

  before(async () => {
    assertDemoDatabase();
    for (const role of ["engineer", "finance-manager", "admin"]) {
      const [row] = await db.select().from(users).where(eq(users.role, role)).limit(1);
      assert.ok(row, `a ${role} user must exist`);
      actors[role] = { id: row!.id, name: row!.name, role };
    }
    await db.insert(projects).values({ name: "Resubmit restart test", code: P, pm: actors.admin!.name, pmUserId: actors.admin!.id, due: "2099-12-31", status: "Construction" });
    await db.insert(budgets).values({ project: P, category: "Materials", owner: actors.admin!.name, planned: 1000, fiscalYear: "2026" });
    const template = (await repo.findAllTemplates()).find((t) => t.name === "Budget Change Request");
    assert.ok(template);
    const e = actors.engineer!;
    const created = await service.createWorkflow(
      { title: `Restart ${tag}`, projectCode: P, templateId: template!.id, type: "Budget Change Request", lineItems: [{ category: "materials", description: "x", currentAmount: 1000, requestedAmount: 1500 }] },
      e.name, e.role, e.id,
    );
    workflowId = created.id;
  });

  after(async () => {
    await db.delete(workflows).where(eq(workflows.projectCode, P));
    await db.delete(budgets).where(eq(budgets.project, P));
    await db.delete(projects).where(eq(projects.code, P));
  });

  test("a later stage asks for revision: stage 1 is current again, the rest are upcoming", async () => {
    const admin = actors.admin!;
    // Stage 1 is the engineer's own (auto-approved). Admin approves the next one, then sends the one after back.
    const stages = await repo.findStagesByWorkflow(workflowId);
    assert.ok(stages.length >= 3, "needs a template with at least three stages");
    await service.decideStage(workflowId, stages[1]!.id, { decision: "approve", decidedBy: admin.name }, admin.role);
    await service.decideStage(workflowId, stages[2]!.id, { decision: "revise", decidedBy: admin.name, comments: "redo" }, admin.role);
    await service.resubmitStage(workflowId, stages[2]!.id, {}, { role: "engineer", name: actors.engineer!.name });
    const after = await repo.findStagesByWorkflow(workflowId);
    assert.deepEqual(after.map((s) => s.status), after.map((s) => (s.sequence === 1 ? "done" : s.sequence === 2 ? "current" : "upcoming")));
    assert.ok(after.filter((s) => s.sequence > 1).every((s) => s.decidedBy === null && s.comments === null));
  });
});
