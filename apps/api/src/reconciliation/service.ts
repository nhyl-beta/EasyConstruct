// apps/api/src/reconciliation/service.ts (objectives fix 1.3)
//
// Runs the cross-checks over live data. Read-only: it reports and never repairs,
// because a mismatch needs a person to decide which record is right.
import * as lifecycleRepo from "../lifecycle/repository.js";
import { computeProgress } from "../lifecycle/service.js";
import { periodRange } from "../payroll/validation.js";
import * as repo from "./repository.js";
import {
  checkBatchHours,
  checkBatchTotals,
  checkBudgetActual,
  checkInactiveMembers,
  checkOrphans,
  checkProgress,
  summarize,
  type BatchHoursRow,
  type CheckResult,
  type ProgressRow,
} from "./checks.js";

const BATCH = 20;

const progressRows = async (): Promise<ProgressRow[]> => {
  const projects = await repo.loadActiveProjects();
  const out: ProgressRow[] = [];
  for (let i = 0; i < projects.length; i += BATCH) {
    const chunk = projects.slice(i, i + BATCH);
    const snapshots = await lifecycleRepo.loadSnapshots(chunk.map((p) => p.code));
    for (const p of chunk) {
      const snapshot = snapshots.get(p.code);
      if (!snapshot) continue;
      out.push({ code: p.code, status: p.status, stored: p.progress, expected: computeProgress(p.status, snapshot) });
    }
  }
  return out;
};

const batchHoursRows = async (): Promise<BatchHoursRow[]> => {
  const batches = await repo.loadApprovedBatchHours();
  const out: BatchHoursRow[] = [];
  for (const b of batches) {
    const range = periodRange(b.period);
    // A period label with no readable dates cannot be matched to attendance, so it is not judged.
    if (!range) continue;
    out.push({
      id: b.id,
      projectCode: b.projectCode,
      period: b.period,
      lineHours: b.lineHours,
      verifiedHours: await repo.verifiedHours(b.projectCode, range.start, range.end),
    });
  }
  return out;
};

export const runReconciliation = async () => {
  const [progress, budgets, batchTotals, batchHours, tasks, milestones, members, attendance, memberCount, inactive] =
    await Promise.all([
      progressRows(),
      repo.loadBudgetRows(),
      repo.loadBatchTotals(),
      batchHoursRows(),
      repo.orphansByProject("tasks", "id", "project_code", "/tasks"),
      repo.orphansByProject("milestones", "id", "project_code", "/projects"),
      repo.orphansByProject("project_members", "id", "project_code", "/projects"),
      repo.orphansByProject("attendance", "id", "project_code", "/attendance"),
      repo.countTable("project_members"),
      repo.inactiveMembers(),
    ]);
  const [taskCount, milestoneCount, attendanceCount] = await Promise.all([
    repo.countTable("tasks"),
    repo.countTable("milestones"),
    repo.countTable("attendance"),
  ]);

  const checks: CheckResult[] = [
    checkProgress(progress),
    checkBudgetActual(budgets),
    checkBatchTotals(batchTotals),
    checkBatchHours(batchHours),
    checkOrphans("orphan-tasks", "Every task belongs to a project", "Each task's project code against the projects table.", taskCount, tasks),
    checkOrphans("orphan-milestones", "Every milestone belongs to a project", "Each milestone's project code against the projects table.", milestoneCount, milestones),
    checkOrphans("orphan-members", "Every staffed member belongs to a project", "Each project member's project code against the projects table.", memberCount, members),
    checkOrphans("orphan-attendance", "Every attendance record with a project points to one", "Each attendance record's project code against the projects table.", attendanceCount, attendance),
    checkInactiveMembers(memberCount, inactive),
  ];
  return { ranAt: new Date().toISOString(), ...summarize(checks), checks };
};
