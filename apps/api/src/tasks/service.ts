// apps/api/src/tasks/service.ts — NEW
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors.js";
import { tasks } from "../db/schema/task.js";
import { orderByFor, paginate, type PageRequest } from "../utils/pagination.js";
import { assertProjectWritable, refreshProjectProgress } from "../lifecycle/service.js";
import * as repo from "./repository.js";
import * as milestonesRepo from "../milestones/repository.js";
import * as notificationsService from "../notifications/service.js";
import { todayManila, addDaysIso } from "../utils/dates.js";
import {
  ALLOCATION_CONFIG,
  allocateTasks,
  assessAssignment,
  rankAssignees,
  type AssignmentWarning,
} from "./suggest.js";
import type { CreateTaskInput, TaskFilters, UpdateTaskInput } from "./types.js";

// G2/J1: PM-facing notice, routed through the shared notifyProject helper.
const notifyPm = async (projectCode: string, title: string, body: string) => {
  await notificationsService.notifyProject(projectCode, ["project-manager"], {
    title,
    body,
    link: `/projects/${encodeURIComponent(projectCode)}`,
  });
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  Pending: ["In Progress"],
  "In Progress": ["Completed", "Pending"],
  Completed: [],
};

export const getAll = async (filters: TaskFilters) => repo.findAll(filters);

export const progressByProject = (filters: TaskFilters) => repo.progressByProject(filters);

export const getPage = async (filters: TaskFilters, request: PageRequest) =>
  paginate(
    request,
    () => repo.countFiltered(filters),
    (window) => repo.findPage(filters, window, orderByFor(request, repo.TASK_SORT_COLUMNS, repo.defaultTaskOrder, tasks.id)),
  );

export const getById = async (id: number) => {
  const task = await repo.findById(id);
  if (!task) throw new NotFoundError("Task", String(id));
  return task;
};

/**
 * A task linked to a milestone can never be due after it. Returns the due date
 * the task should end up with: its own, if it fits; the milestone's, if it has
 * none; and throws if it is later than the milestone's.
 */
export const resolveDueDateAgainstMilestone = (
  dueDate: string | null | undefined,
  milestone: { title: string; estimatedCompletionDate: string | null },
): string | undefined => {
  const limit = milestone.estimatedCompletionDate;
  if (!limit) return dueDate ?? undefined;
  if (!dueDate) return limit;
  if (dueDate > limit) {
    throw new ValidationError(
      `Task due date (${dueDate}) cannot be later than the milestone "${milestone.title}" due date (${limit})`,
    );
  }
  return dueDate;
};

export const create = async (input: CreateTaskInput) => {
  await assertProjectWritable(input.projectCode);
  const { milestoneId, ...taskInput } = input;

  // Validated before anything is written, so a rejected milestone link never
  // leaves a half-created task behind.
  let dueDate = taskInput.dueDate;
  if (milestoneId != null) {
    const milestone = await milestonesRepo.findById(milestoneId);
    if (!milestone) throw new NotFoundError("Milestone", String(milestoneId));
    if (milestone.projectCode !== taskInput.projectCode) {
      throw new ValidationError("That milestone belongs to a different project");
    }
    if (milestone.status === "completed" || milestone.status === "cancelled") {
      throw new ValidationError(`Milestone "${milestone.title}" is ${milestone.status} and can't take new tasks`);
    }
    dueDate = resolveDueDateAgainstMilestone(dueDate, milestone);
  }

  const task = await repo.create({ ...taskInput, dueDate });
  if (!task) throw new Error("Failed to create task");
  if (milestoneId != null) {
    await milestonesRepo.createLink(milestoneId, { linkType: "task", linkId: task.id });
  }
  await refreshProjectProgress(task.projectCode);
  return task;
};

// Site Personnel may only move their own task through the allowed status flow.
export const updateStatus = async (
  id: number,
  nextStatus: string,
  actingUserId: number,
  evidence: { completionNote?: string; completionFileUrl?: string } = {},
) => {
  const existing = await getById(id);
  await assertProjectWritable(existing.projectCode);
  if (existing.assignedToUserId !== actingUserId) {
    throw new ForbiddenError("You can only update tasks assigned to you");
  }
  const allowed = VALID_TRANSITIONS[existing.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    throw new ValidationError(
      `Cannot move task from '${existing.status}' to '${nextStatus}'`,
    );
  }

  const completing = nextStatus === "Completed";
  const progress = completing ? 100 : existing.progress;

  // The zod schema already requires a note on the Completed transition;
  // re-checked here so the rule holds for any non-HTTP caller too.
  if (completing && !evidence.completionNote?.trim()) {
    throw new ValidationError(
      "Describe what was completed before marking the task done",
    );
  }

  const updated = await repo.update(id, {
    status: nextStatus,
    progress,
    ...(completing
      ? {
          completionNote: evidence.completionNote?.trim(),
          completionFileUrl: evidence.completionFileUrl,
          completedAt: new Date(),
        }
      : {}),
  });
  if (!updated) throw new NotFoundError("Task", String(id));
  // Construction's progress is completed/total tasks (D-2) — the only gate
  // band whose number this call site can move on its own.
  await refreshProjectProgress(updated.projectCode);

  if (completing) {
    await notifyPm(
      updated.projectCode,
      "Task completed",
      `"${updated.title}" was marked complete on ${updated.projectCode}`,
    );

    // G2: if every task linked to a milestone is now Completed, tell the PM
    // the milestone itself is ready to be moved along.
    const linkedMilestones = await milestonesRepo.findMilestonesLinkedToTask(updated.id);
    const linksByMilestone = await milestonesRepo.findLinksForMilestones(linkedMilestones.map((m) => m.id));
    for (const milestone of linkedMilestones) {
      const links = linksByMilestone.get(milestone.id) ?? [];
      const taskLinks = links.filter((l) => l.linkType === "task");
      const allDone = taskLinks.length > 0 && taskLinks.every((l) => l.task?.status === "Completed");
      if (allDone) {
        await notifyPm(
          updated.projectCode,
          "Milestone ready",
          `All tasks linked to milestone "${milestone.title}" are complete`,
        );
      }
    }
  }

  return updated;
};

export const update = async (id: number, input: UpdateTaskInput) => {
  const existing = await getById(id);
  await assertProjectWritable(existing.projectCode);

  // A linked task can't be moved past any of its milestones' due dates.
  if (input.dueDate) {
    for (const milestone of await milestonesRepo.findMilestonesLinkedToTask(id)) {
      resolveDueDateAgainstMilestone(input.dueDate, milestone);
    }
  }
  const updated = await repo.update(id, input);
  if (!updated) throw new NotFoundError("Task", String(id));
  await refreshProjectProgress(updated.projectCode);
  return updated;
};

export const remove = async (id: number) => {
  const existing = await getById(id);
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError("Task", String(id));
  await refreshProjectProgress(existing.projectCode);
  return deleted;
};

// ── Decision support: allocation and workload warnings (fixes 2.1, 2.2) ──
// Read-only advice. Nothing below writes a task or blocks one.

const windowStart = (today: string) => addDaysIso(today, -(ALLOCATION_CONFIG.attendanceWindowDays - 1));

export const suggestAssignees = async (q: { projectCode: string; title: string; dueDate?: string; milestoneId?: number }) => {
  const today = todayManila();
  let dueDate = q.dueDate;
  if (!dueDate && q.milestoneId != null) {
    const milestone = await milestonesRepo.findById(q.milestoneId);
    if (milestone && milestone.projectCode === q.projectCode) dueDate = milestone.estimatedCompletionDate ?? undefined;
  }
  const { candidates, unlinked } = await repo.loadAllocationData(q.projectCode, today, windowStart(today));
  const result = rankAssignees(candidates, { title: q.title, dueDate });
  return {
    projectCode: q.projectCode,
    dueDate: dueDate ?? null,
    suggestions: result.ranked,
    excluded: [
      ...result.excluded,
      ...unlinked.map((u) => ({ userId: u.userId, name: u.name, reason: "no linked employee record" })),
    ],
    basis: result.basis,
  };
};

export const suggestAllocation = async (projectCode: string) => {
  const today = todayManila();
  const [{ candidates }, unassigned] = await Promise.all([
    repo.loadAllocationData(projectCode, today, windowStart(today)),
    repo.findUnassigned(projectCode),
  ]);
  const proposals = allocateTasks(
    candidates,
    unassigned.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate })),
  );
  return {
    projectCode,
    basis: rankAssignees([], { title: "" }).basis,
    items: unassigned.map((t, i) => ({
      taskId: t.id,
      taskCode: t.taskCode,
      title: t.title,
      dueDate: t.dueDate,
      suggestions: proposals[i]?.suggestions ?? [],
    })),
  };
};

/** Warnings for giving `userId` a task due `dueDate`. Never throws on a rule; an unknown user yields none. */
export const assignmentWarnings = async (
  userId: number | null | undefined,
  dueDate: string | null | undefined,
  excludeTaskId?: number,
): Promise<AssignmentWarning[]> => {
  if (userId == null) return [];
  try {
    const today = todayManila();
    const { candidates } = await repo.loadAllocationDataForUsers([{ userId, userName: "" }], today, windowStart(today));
    const c = candidates[0];
    if (!c) return [];
    const open = c.openTasks.filter((t) => t.id !== excludeTaskId);
    return assessAssignment({ ...c, openTasks: open }, dueDate);
  } catch (err) {
    console.error("[tasks] assignment warnings failed", err);
    return [];
  }
};
