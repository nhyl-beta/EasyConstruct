// apps/api/src/milestones/service.ts — NEW
import { ConflictError, ForbiddenError, NotFoundError } from "../../../core/utils/errors.js";
import { notificationsService } from "../../platform/index.js";
import { assertProjectWritable, refreshProjectProgress } from "../lifecycle/service.js";
import * as repo from "./repository.js";
import { milestones as milestonesTable } from "../../../core/db/schema/milestones.js";
import { orderByFor, paginate, type PageRequest } from "../../../core/utils/pagination.js";
import * as projectMemberRepo from "../project-members/repository.js";
import { assertEngineerMayUpdate, openLinkedTasks } from "./permissions.js";
import * as tasksRepo from "../tasks/repository.js";
import { resolveDueDateAgainstMilestone } from "../tasks/service.js";
import type {
  CreateMilestoneInput,
  CreateMilestoneLinkInput,
  MilestoneStatus,
  UpdateMilestoneInput,
} from "./types.js";

// A milestone's status was only ever visible to whoever had that project's
// detail page open — nothing told the roles who actually act on it that
// anything had changed. Mirrors the notify-on-event pattern already used by
// project-members/service.ts (staffing an architect) and
// budget-approval-steps — role-targeted rows in the same `notifications`
// table, not a new mechanism.
const NOTIFY_ROLES_BY_STATUS: Partial<Record<MilestoneStatus, string[]>> = {
  active: ["engineer"],
  "at-risk": ["owner", "engineer", "admin"],
  completed: ["owner", "admin"],
  cancelled: ["owner"],
};

export const getAll = async (projectCode?: string) => repo.findAll(projectCode);

export const getPage = async (filters: repo.MilestoneFilters, request: PageRequest) =>
  paginate(
    request,
    () => repo.countFiltered(filters),
    (window) => repo.findPage(filters, window, orderByFor(request, repo.MILESTONE_SORT_COLUMNS, repo.defaultMilestoneOrder, milestonesTable.id)),
  );

export const getById = async (id: number) => {
  const milestone = await repo.findById(id);
  if (!milestone) throw new NotFoundError("Milestone", String(id));
  // F4: resolved links — currently only linkType='task' resolves to
  // anything (title/status/assignee); other link types come back bare
  // (linkType/linkId only) until something actually creates one.
  const links = await repo.findLinks(id);
  return { ...milestone, links };
};

/**
 * Every milestone starts as a draft — an estimate the Project Manager is
 * staking out, not a commitment the project is yet being held to. There is
 * no path to create one in any other status; a draft is promoted later
 * through `update()`, a deliberate second step.
 */
export const create = async (input: CreateMilestoneInput, createdBy: string) => {
  await assertProjectWritable(input.projectCode);
  const created = await repo.create({ ...input, createdBy, status: "draft" });
  if (!created) throw new Error("Failed to create milestone");
  await refreshProjectProgress(created.projectCode);
  return created;
};

export const update = async (
  id: number,
  input: UpdateMilestoneInput,
  actor?: { id: number; role: string; name?: string },
) => {
  const existing = await getById(id);
  // C: an Engineer may only mark an active/at-risk milestone completed, on a
  // project they are staffed on (milestones/permissions.ts). PM/admin: unchanged.
  if (actor?.role === "engineer") {
    const staffed = await projectMemberRepo.findAll({
      projectCode: existing.projectCode,
      userId: actor.id,
      role: "engineer",
    });
    assertEngineerMayUpdate(input, existing.status, staffed.length > 0);
  }
  await assertProjectWritable(existing.projectCode);

  // D2: completing records who and when, and is refused while any linked task
  // is still open (see milestones/permissions.ts openLinkedTasks).
  const completing = input.status === "completed" && existing.status !== "completed";
  if (completing) {
    const open = openLinkedTasks(existing.links);
    if (open.length > 0) {
      throw new ConflictError(
        `Finish the linked task${open.length === 1 ? "" : "s"} first: ${open.slice(0, 5).join(", ")}${open.length > 5 ? ` and ${open.length - 5} more` : ""}`,
      );
    }
  }
  const updated = await repo.update(
    id,
    completing
      ? { ...input, completedBy: actor?.name ?? "unknown", completedAt: new Date() }
      : input.status && input.status !== "completed" && existing.status === "completed"
        ? { ...input, completedBy: null, completedAt: null }
        : input,
  );
  if (!updated) throw new NotFoundError("Milestone", String(id));

  // A moved milestone date carries its linked tasks with it: any unfinished
  // task now due after the milestone (or with no due date) is pulled to the
  // milestone's date, and the PM and the assignee are told. Tasks already due
  // earlier are left alone — they still fit.
  if (
    input.estimatedCompletionDate &&
    input.estimatedCompletionDate !== existing.estimatedCompletionDate
  ) {
    await syncLinkedTaskDueDates(updated);
  }

  if (input.status && input.status !== existing.status) {
    const recipients = NOTIFY_ROLES_BY_STATUS[input.status] ?? [];
    await Promise.all(
      recipients.map((recipientRole) =>
        notificationsService.create({
          recipientRole,
          title: `Milestone ${input.status}`,
          body: `"${updated.title}" on project ${updated.projectCode} is now ${input.status}.`,
          link: `/projects/${encodeURIComponent(updated.projectCode)}`,
        }),
      ),
    );
    // C: the PM who owns the project is told too (the role broadcast above
    // only reaches owner/admin).
    if (input.status === "completed" && actor?.role !== "project-manager") {
      await notificationsService.notifyProject(updated.projectCode, ["project-manager"], {
        title: "Milestone completed",
        body: `"${updated.title}" on project ${updated.projectCode} was marked completed.`,
        link: `/projects/${encodeURIComponent(updated.projectCode)}`,
      });
    }
  }

  await refreshProjectProgress(updated.projectCode);
  return updated;
};

const syncLinkedTaskDueDates = async (milestone: {
  id: number;
  projectCode: string;
  title: string;
  estimatedCompletionDate: string | null;
}) => {
  const limit = milestone.estimatedCompletionDate;
  if (!limit) return;
  const links = await repo.findLinks(milestone.id);
  const moved: string[] = [];
  const tasksById = await tasksRepo.findByIds(
    links.flatMap((link) => (link.linkType === "task" && link.task ? [link.task.id] : [])),
  );
  const handled = new Set<number>();
  for (const link of links) {
    if (link.linkType !== "task" || !link.task) continue;
    // A task linked twice is read once above; handle it once, as the old
    // per-link re-read effectively did.
    if (handled.has(link.task.id)) continue;
    handled.add(link.task.id);
    const task = tasksById.get(link.task.id);
    if (!task || task.status === "Completed") continue;
    if (task.dueDate && task.dueDate <= limit) continue;
    await tasksRepo.update(task.id, { dueDate: limit });
    moved.push(task.title);
    if (task.assignedToUserId != null) {
      await notificationsService.create({
        recipientUserId: task.assignedToUserId,
        projectCode: task.projectCode,
        title: "Task due date changed",
        body: `"${task.title}" is now due ${limit}, following milestone "${milestone.title}".`,
        link: "/tasks",
      });
    }
  }
  if (moved.length > 0) {
    await notificationsService.notifyProject(milestone.projectCode, ["project-manager"], {
      title: "Linked task due dates moved",
      body: `Milestone "${milestone.title}" is now due ${limit}; ${moved.length} linked task(s) were brought in line: ${moved.join(", ")}`,
      link: `/projects/${encodeURIComponent(milestone.projectCode)}`,
    });
  }
};

export const remove = async (id: number) => {
  const existing = await getById(id);
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError("Milestone", String(id));
  await refreshProjectProgress(existing.projectCode);
  return existing;
};

// ── Links (F4) ───────────────────────────────────────────────────────────
//
// Route-level guard (milestones/routes.ts) is "PM/admin/it-designer, plus
// engineer for linkType='task'" — the engineer half can't be expressed as a
// single requireRole() since it depends on the request BODY, not just the
// role, so it's enforced here instead.
const assertCanLink = (requesterRole: string, linkType: string) => {
  if (["project-manager", "admin"].includes(requesterRole)) return;
  if (requesterRole === "engineer" && linkType === "task") return;
  throw new ForbiddenError(
    `Role '${requesterRole}' cannot link a '${linkType}' to a milestone`,
  );
};

export const createLink = async (
  milestoneId: number,
  input: CreateMilestoneLinkInput,
  requesterRole: string,
) => {
  assertCanLink(requesterRole, input.linkType);
  const milestone = await getById(milestoneId);
  await assertProjectWritable(milestone.projectCode);

  // A task can't outlive the milestone it is linked to: one already due later
  // is refused, one with no date inherits the milestone's.
  if (input.linkType === "task") {
    const task = await tasksRepo.findById(input.linkId);
    if (!task) throw new NotFoundError("Task", String(input.linkId));
    const resolved = resolveDueDateAgainstMilestone(task.dueDate, milestone);
    if (resolved && resolved !== task.dueDate) await tasksRepo.update(task.id, { dueDate: resolved });
  }

  const created = await repo.createLink(milestoneId, input);
  if (!created) throw new Error("Failed to create milestone link");
  await refreshProjectProgress(milestone.projectCode);
  return getById(milestoneId);
};

export const removeLink = async (milestoneId: number, linkId: number, requesterRole: string) => {
  const link = await repo.findLinkById(linkId);
  if (!link || link.milestoneId !== milestoneId) {
    throw new NotFoundError("Milestone link", String(linkId));
  }
  assertCanLink(requesterRole, link.linkType);
  const milestone = await getById(milestoneId);
  await assertProjectWritable(milestone.projectCode);
  const deleted = await repo.removeLink(linkId);
  if (!deleted) throw new NotFoundError("Milestone link", String(linkId));
  await refreshProjectProgress(milestone.projectCode);
  return getById(milestoneId);
};
