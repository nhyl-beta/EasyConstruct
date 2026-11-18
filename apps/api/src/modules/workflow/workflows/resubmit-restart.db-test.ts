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
    for (const role of ["engineer", "finance-manager", "project-manager", "admin"]) {
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

  // Whoever raised the request (Finance and PM can raise one for the Engineer), a revision from the
  // Finance stage must come back through the chain in order, never straight to the PM stage.
  for (const initiator of ["finance-manager", "project-manager"]) {
    test(`raised by ${initiator}: revise at Finance then resubmit restarts in order`, async () => {
      const admin = actors.admin!;
      const who = actors[initiator]!;
      const template = (await repo.findAllTemplates()).find((t) => t.name === "Budget Change Request");
      const created = await service.createWorkflow(
        { title: `Order ${initiator} ${tag}`, projectCode: P, templateId: template!.id, type: "Budget Change Request", lineItems: [{ category: "materials", description: "x", currentAmount: 1000, requestedAmount: 1500 }] },
        who.name, who.role, who.id,
      );
      const stages = await repo.findStagesByWorkflow(created.id);
      const names = stages.map((s) => s.role);
      const financeIdx = names.indexOf("finance-manager");
      for (const s of stages.slice(0, financeIdx)) {
        if ((await repo.findStageById(s.id))!.status === "current") await service.decideStage(created.id, s.id, { decision: "approve", decidedBy: admin.name }, admin.role);
      }
      await service.decideStage(created.id, stages[financeIdx]!.id, { decision: "revise", decidedBy: admin.name, comments: "redo" }, admin.role);
      await service.resubmitStage(created.id, stages[financeIdx]!.id, {}, { role: who.role, name: who.name });
      const now = await repo.findStagesByWorkflow(created.id);
      const current = now.filter((s) => s.status === "current");
      assert.equal(current.length, 1);
      assert.ok(current[0]!.sequence <= stages[financeIdx]!.sequence, `current stage is ${current[0]!.role}, not past Finance`);
      assert.ok(now.filter((s) => s.sequence > current[0]!.sequence).every((s) => s.status === "upcoming"));
      assert.ok(now.filter((s) => s.sequence < current[0]!.sequence).every((s) => s.status === "done"), "only the initiator's auto-approved step precedes the current one");
    });
  }
});
