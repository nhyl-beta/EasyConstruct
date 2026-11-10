// Real-database test (npm run test:db): what the approval lists and cards show.
//  - B-168  "Decided by me" / "History" list a request once, however many stages it has decided.
//  - B-166 / B-167  the Engineer's own in-progress request is in Pending, and the card agrees.
// Fixtures live under a throwaway project code and are removed in after().
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { users } from "../../../core/db/schema/users.js";
import { workflows, workflowStages } from "../../../core/db/schema/workflows.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import * as repo from "./repository.js";
import * as service from "./service.js";

const tag = `DBW${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;
const visible = new Set([P]);

type Who = { id: number; name: string; role: string };
let engineer: Who, finance: Who, pm: Who, admin: Who;
let workflowId: number;

const who = async (role: string): Promise<Who> => {
  const [row] = await db.select().from(users).where(eq(users.role, role)).limit(1);
  assert.ok(row, `a ${role} user must exist`);
  return { id: row!.id, name: row!.name, role };
};

const queue = (scope: "pending" | "mine" | "history", u: Who) =>
  service.getApprovalQueue(scope, u.role, u.name, visible, u.id);
const mine = async (u: Who) => (await queue("pending", u)).filter((r) => r.workflowId === workflowId);
const stats = (u: Who) => service.getApprovalStats(u.role, u.name, visible, false, u.id);

const decide = async (u: Who, decision: "approve" | "reject" = "approve") => {
  const [current] = (await repo.findStagesByWorkflow(workflowId)).filter((s) => s.status === "current");
  assert.ok(current, "a stage must be waiting");
  await service.decideStage(workflowId, current!.id, { decision, decidedBy: u.name }, u.role);
};

describe("approval lists and cards", () => {
  before(async () => {
    assertDemoDatabase();
    engineer = await who("engineer");
    finance = await who("finance-manager");
    pm = await who("project-manager");
    admin = await who("admin");
    await db.insert(projects).values({ name: "Approval views test", code: P, pm: pm.name, pmUserId: pm.id, due: "2099-12-31", status: "Construction" });
    const template = (await repo.findAllTemplates()).find((t) => t.name === "Budget Change Request");
    assert.ok(template, "the Budget Change Request template must be seeded");
    const created = await service.createWorkflow(
      { title: `Budget change ${tag}`, projectCode: P, templateId: template!.id, amount: 5000, type: "Budget Change Request" },
      engineer.name,
      engineer.role,
      engineer.id,
    );
    workflowId = created.id;
  });

  after(async () => {
    await db.delete(workflowStages).where(eq(workflowStages.workflowId, workflowId));
    await db.delete(workflows).where(eq(workflows.id, workflowId));
    await db.delete(projects).where(eq(projects.code, P));
  });

  test("B-168: one request creates exactly one workflow and four stages", async () => {
    const rows = await db.select().from(workflows).where(eq(workflows.projectCode, P));
    assert.equal(rows.length, 1);
    const stages = await db.select().from(workflowStages).where(eq(workflowStages.workflowId, workflowId));
    assert.equal(stages.length, 4);
    assert.equal(new Set(stages.map((s) => s.roleLabel)).size, 4);
  });

  test("B-166/167: the Engineer sees their own request in Pending, view-only, and the card counts it", async () => {
    const rows = await mine(engineer);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.waitingLabel, "Waiting on Finance Review");
    assert.equal(rows[0]!.viewOnly, true);
    assert.equal((await stats(engineer)).pending, 1);
  });

  test("B-166/167: the owner of the current stage still sees it, actionable", async () => {
    const rows = await mine(finance);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.viewOnly, false);
    assert.equal((await stats(finance)).pending, 1);
  });

  test("B-166/167: a role with no part in the request sees nothing", async () => {
    const other = await who("site-personnel");
    assert.equal((await mine(other)).length, 0);
    assert.equal((await stats(other)).pending, 0);
  });

  test("B-166/167: the label follows the request and it leaves Pending after the last approval", async () => {
    await decide(finance);
    assert.equal((await mine(engineer))[0]!.waitingLabel, "Waiting on PM Sign-off");
    assert.equal((await stats(engineer)).pending, 1);
    await decide(pm);
    assert.equal((await mine(engineer))[0]!.waitingLabel, "Waiting on Admin Final Approval");
    await decide(admin);
    assert.equal((await mine(engineer)).length, 0);
    assert.equal((await stats(engineer)).pending, 0);
  });

  test("B-168: a request with four decided stages is listed once in History and once in Decided by me", async () => {
    const history = (await queue("history", admin)).filter((r) => r.workflowId === workflowId);
    assert.equal(history.length, 1);
    const decidedByFinance = (await queue("mine", finance)).filter((r) => r.workflowId === workflowId);
    assert.equal(decidedByFinance.length, 1);
    // the card still counts decisions, not requests
    assert.ok((await stats(admin)).thisWeek >= 4);
  });
});
