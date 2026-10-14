// server/src/forecast/repository.ts (objectives fix 3.2): the rows the forecast reads, nothing else.
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { budgets } from "../db/schema/finance.js";
import { milestones } from "../db/schema/milestones.js";
import { projects } from "../db/schema/projects.js";
import { tasks } from "../db/schema/task.js";

export const loadProjectInputs = async (projectCode: string) => {
  const [project, budgetRows, taskRows, milestoneRows] = await Promise.all([
    db.select({ contractValue: projects.contractValue }).from(projects).where(eq(projects.code, projectCode)),
    db.select({ planned: budgets.planned, actual: budgets.actual }).from(budgets).where(eq(budgets.project, projectCode)),
    db.select({ status: tasks.status }).from(tasks).where(eq(tasks.projectCode, projectCode)),
    db
      .select({
        id: milestones.id,
        title: milestones.title,
        status: milestones.status,
        estimatedCompletionDate: milestones.estimatedCompletionDate,
      })
      .from(milestones)
      .where(eq(milestones.projectCode, projectCode)),
  ]);
  return {
    contractValue: project[0]?.contractValue != null ? Number(project[0].contractValue) : null,
    budgets: budgetRows.map((b) => ({ planned: Number(b.planned), actual: Number(b.actual) })),
    tasks: taskRows,
    milestones: milestoneRows,
  };
};
