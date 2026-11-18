// Real-database test (npm run test:db): the project context behind the suggested resolution.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { issues } from "../../../core/db/schema/issues.js";
import { tasks } from "../../../core/db/schema/task.js";
import { milestones } from "../../../core/db/schema/milestones.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import * as repo from "./repository.js";
import { suggestResolution } from "./suggestions.js";

const tag = `SG${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;
const issue = (n: number, over: Record<string, unknown> = {}) => ({
  issueCode: `ZZ-${tag}-${n}`,
  projectCode: P,
  title: `Issue ${n}`,
  description: "d",
  category: "Material",
  reportedByName: "t",
  reportedByRole: "engineer",
  ...over,
});

describe("issue suggestion context", () => {
  let subjectId: number;

  before(async () => {
    assertDemoDatabase();
    const [a] = await db.insert(issues).values(issue(1)).returning();
    subjectId = a!.id;
    await db.insert(issues).values([
      issue(2), // open, same category: counts
      issue(3, { category: "Safety" }), // other category: no
      issue(4, { status: "Resolved" }), // resolved: no
    ]);
    await db.insert(tasks).values([
      { taskCode: `ZZ-${tag}-T1`, projectCode: P, title: "late", dueDate: "2020-01-01" },
      { taskCode: `ZZ-${tag}-T2`, projectCode: P, title: "late but done", dueDate: "2020-01-01", status: "Completed" },
      { taskCode: `ZZ-${tag}-T3`, projectCode: P, title: "future", dueDate: "2099-01-01" },
    ]);
    await db.insert(milestones).values([
      { projectCode: P, title: "late", status: "active", estimatedCompletionDate: "2020-01-01", createdBy: "t" },
      { projectCode: P, title: "draft is an estimate", status: "draft", estimatedCompletionDate: "2020-01-01", createdBy: "t" },
    ]);
  });

  after(async () => {
    await db.delete(issues).where(eq(issues.projectCode, P));
    await db.delete(tasks).where(eq(tasks.projectCode, P));
    await db.delete(milestones).where(eq(milestones.projectCode, P));
  });

  test("counts only what each rule means", async () => {
    const ctx = await repo.suggestionContext({ id: subjectId, projectCode: P, category: "Material" }, "2026-11-18");
    assert.deepEqual(ctx, { sameCategoryOpen: 1, overdueTasks: 1, slippingMilestones: 1 });
  });

  test("an overdue task and a slipping milestone become context lines", () => {
    const s = suggestResolution({ category: "Material", severity: "High" }, { sameCategoryOpen: 1, overdueTasks: 1, slippingMilestones: 1 });
    assert.equal(s.context.length, 2);
  });
});
