import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlan,
  itemsToAddOnRegenerate,
  milestoneInputFor,
  selectTemplate,
  suggestionStatus,
  taskCodeFor,
  taskInputFor,
  type MilestonePayload,
  type TaskPayload,
} from "./plan.js";

test("template selection by project type, with fallbacks", () => {
  assert.equal(selectTemplate("Residential").key, "Residential");
  assert.equal(selectTemplate("Renewable Energy").key, "Renewable Energy");
  assert.equal(selectTemplate("Spaceport").key, "General");
  assert.equal(selectTemplate(null).key, "General");
  assert.equal(selectTemplate("Commercial", "Design").key, "Design");
});

test("milestone dates run one after another from the approval date", () => {
  const plan = buildPlan({ projectType: "Residential", approvalDate: "2026-11-01" });
  const ms = plan.items.filter((i) => i.kind === "milestone").map((i) => i.payload as MilestonePayload);
  assert.equal(ms[0]!.startDate, "2026-11-01");
  assert.equal(ms[0]!.estimatedCompletionDate, "2026-11-15"); // mobilization: 14 days
  for (let i = 1; i < ms.length; i++) assert.equal(ms[i]!.startDate, ms[i - 1]!.estimatedCompletionDate);
  assert.equal(plan.startSource, "approval-date");
  assert.match(plan.basis, /Residential building template/);
  assert.match(plan.basis, /2026-11-01/);
});

test("the Notice to Proceed date wins over the approval date", () => {
  const plan = buildPlan({ projectType: "Commercial", approvalDate: "2026-11-01", noticeToProceedDate: "2026-12-10" });
  assert.equal(plan.startSource, "notice-to-proceed");
  assert.equal(plan.startDate, "2026-12-10");
  assert.match(plan.basis, /Notice to Proceed date \(2026-12-10\)/);
});

test("a task is never due after its milestone, and every item states a basis", () => {
  const plan = buildPlan({ projectType: "Industrial", approvalDate: "2026-11-01" });
  const ms = new Map(plan.items.filter((i) => i.kind === "milestone").map((i) => [i.key, i.payload as MilestonePayload]));
  const tasks = plan.items.filter((i) => i.kind === "task");
  assert.ok(tasks.length > 0);
  for (const t of tasks) {
    const p = t.payload as TaskPayload;
    const m = ms.get(p.milestoneKey)!;
    assert.ok(p.dueDate <= m.estimatedCompletionDate, `${p.title} due ${p.dueDate} after ${m.estimatedCompletionDate}`);
    assert.ok(p.dueDate > m.startDate);
  }
  for (const i of plan.items) assert.ok((i.payload as { basis: string }).basis.length > 10);
  assert.ok(plan.items.some((i) => i.kind === "responsibility"));
});

test("keys are unique within a plan", () => {
  const plan = buildPlan({ projectType: "Infrastructure", approvalDate: "2026-11-01" });
  assert.equal(new Set(plan.items.map((i) => i.key)).size, plan.items.length);
});

test("regenerate skips accepted keys only, so accepted items are never overwritten", () => {
  const plan = buildPlan({ projectType: "Residential", approvalDate: "2026-11-01" });
  const accepted = new Set(["mobilization", "mobilization.t1"]);
  const again = itemsToAddOnRegenerate(plan, accepted);
  assert.equal(again.length, plan.items.length - 2);
  assert.ok(again.every((i) => !accepted.has(i.key)));
});

test("suggestion status is complete only when nothing is pending", () => {
  assert.equal(suggestionStatus(["accepted", "pending"]), "open");
  assert.equal(suggestionStatus(["accepted", "discarded"]), "complete");
  assert.equal(suggestionStatus([]), "complete");
});

test("accepting a milestone builds a draft-milestone input; a task links to it and stays unassigned by default", () => {
  const plan = buildPlan({ projectType: "Residential", approvalDate: "2026-11-01" });
  const m = plan.items.find((i) => i.kind === "milestone")!.payload as MilestonePayload;
  const t = plan.items.find((i) => i.kind === "task")!.payload as TaskPayload;
  const mi = milestoneInputFor(m, "PRJ-1");
  assert.equal(mi.projectCode, "PRJ-1");
  assert.equal(mi.estimatedCompletionDate, m.estimatedCompletionDate);
  assert.match(mi.description, /Suggested plan/);
  assert.ok(!("status" in mi), "creation is always a draft; no status is passed");

  const unassigned = taskInputFor(t, "PRJ-1", 7, "TSK-000001");
  assert.equal(unassigned.milestoneId, 7);
  assert.equal(unassigned.status, "Pending");
  assert.ok(!("assignedToUserId" in unassigned));
  const assigned = taskInputFor(t, "PRJ-1", 7, "TSK-000001", { userId: 4, name: "A B" });
  assert.equal(assigned.assignedToUserId, 4);
});

test("task codes fit the 20 character column", () => {
  assert.ok(taskCodeFor(1_790_000_123_456, 99).length <= 20);
});
