import { ConflictError, ForbiddenError, NotFoundError } from "../utils/errors.js";
import * as projectsService from "../projects/service.js";
import * as notificationsService from "../notifications/service.js";
import { assertProjectWritable, refreshProjectProgress } from "../lifecycle/service.js";
import * as repo from "./repository.js";
import { asc } from "drizzle-orm";
import { projectMembers as projectMembersTable } from "../db/schema/project-members.js";
import { orderByFor, paginate, type PageRequest } from "../utils/pagination.js";
import type { CreateProjectMemberInput, ProjectMemberFilters } from "./types.js";

const PRIVILEGED_ROLES = ["admin", "it-designer"];

// Same ownership rule as the documents PM-scoping fix: a project-manager may
// only mutate assignments on a project they actually manage (projects.pm).
// Admin/IT Designer bypass this, same as everywhere else in the app.
const assertCanManageProject = async (projectCode: string, requesterRole: string, requesterName: string) => {
  if (PRIVILEGED_ROLES.includes(requesterRole)) return;
  const project = await projectsService.getByCode(projectCode);
  if (project.pm !== requesterName) {
    throw new ForbiddenError("You can only manage the workforce of projects you manage");
  }
};

export const getAll = async (filters: ProjectMemberFilters) => repo.findAll(filters);

export const getPage = async (filters: ProjectMemberFilters, request: PageRequest) =>
  paginate(
    request,
    () => repo.countFiltered(filters),
    (window) => repo.findPage(filters, window, orderByFor(request, repo.MEMBER_SORT_COLUMNS, [asc(projectMembersTable.id)], projectMembersTable.id)),
  );

export const create = async (
  input: CreateProjectMemberInput,
  requesterRole: string,
  requesterName: string,
) => {
  await assertCanManageProject(input.projectCode, requesterRole, requesterName);
  await assertProjectWritable(input.projectCode);
  const existing = await repo.findAll({ projectCode: input.projectCode });
  if (existing.some((e) => e.userId === input.userId && e.role === input.role)) {
    throw new ConflictError("This person is already staffed on this project in that role");
  }
  const created = await repo.create(input);
  if (!created) throw new Error("Failed to add project member");

  // J2: was architect-only, and broadcast to every architect org-wide
  // rather than the one actually staffed — notify the specific person added,
  // whatever their role.
  await notificationsService.create({
    recipientUserId: created.userId,
    title: "Assigned to a project",
    body: `You were assigned to project ${created.projectCode} as ${created.role}.`,
    link: `/projects/${encodeURIComponent(created.projectCode)}`,
    projectCode: created.projectCode,
  });

  await refreshProjectProgress(created.projectCode);
  return created;
};

export const remove = async (id: number, requesterRole: string, requesterName: string) => {
  const target = await repo.findById(id);
  if (!target) throw new NotFoundError("Project member", String(id));
  await assertCanManageProject(target.projectCode, requesterRole, requesterName);
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError("Project member", String(id));

  await notificationsService.create({
    recipientUserId: deleted.userId,
    title: "Removed from a project",
    body: `You were removed from project ${deleted.projectCode}.`,
    link: `/projects/${encodeURIComponent(deleted.projectCode)}`,
    projectCode: deleted.projectCode,
  });

  await refreshProjectProgress(deleted.projectCode);
  return deleted;
};
