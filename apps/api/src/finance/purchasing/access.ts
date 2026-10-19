// Who may see and act on a project's purchasing records. Server authorization
// only: the same rules the rest of the app uses (project PM link, project
// membership), never a client-supplied role.
import type { Request } from "express";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "../../utils/errors.js";
import * as projectsRepo from "../../projects/repository.js";
import * as projectMemberRepo from "../../project-members/repository.js";
import { isOwnProject, visibleProjectCodes } from "../../projects/service.js";
import type { AuthedRequest } from "../../middleware/auth.js";

export interface Actor {
  id: number;
  name: string;
  role: string;
}

export const actorOf = (req: Request): Actor => {
  const u = (req as AuthedRequest).authUser;
  if (!u) throw new UnauthorizedError();
  return { id: u.id, name: u.name, role: u.role };
};

export const isFinance = (a: Actor): boolean => a.role === "finance-manager" || a.role === "admin";

export async function loadProject(code: string) {
  const project = await projectsRepo.findByCode(code);
  if (!project) throw new NotFoundError("Project", code);
  return project;
}

type ProjectRow = NonNullable<Awaited<ReturnType<typeof projectsRepo.findByCode>>>;

/** Is `actor` this project's own Project Manager? (pm_user_id link, name fallback while it is null.) */
export const isProjectPm = (project: ProjectRow, actor: Actor): boolean =>
  actor.role === "project-manager" && isOwnProject(project, { role: actor.role, userId: actor.id, name: actor.name });

/** The membership row that staffs `actor` on `projectCode`, optionally limited to some project roles. */
export async function staffing(actor: Actor, projectCode: string, roles?: readonly string[]) {
  const rows = await projectMemberRepo.findAll({ projectCode, userId: actor.id });
  return rows.find((m) => !roles || roles.includes(m.role)) ?? null;
}

export const projectHasPm = (project: ProjectRow): boolean => project.pmUserId != null || !!project.pm;

/** null = the caller sees every project; otherwise the codes they may see. */
export const visibleCodes = async (actor: Actor): Promise<Set<string> | null> =>
  visibleProjectCodes({ role: actor.role, userId: actor.id, name: actor.name });

/** A row is visible to its owner, or when its project is one the caller may see. */
export async function canSee(actor: Actor, projectCode: string | null | undefined, ownerUserId?: number | null): Promise<boolean> {
  if (ownerUserId != null && ownerUserId === actor.id) return true;
  const codes = await visibleCodes(actor);
  return codes === null || (!!projectCode && codes.has(projectCode));
}

export async function assertCanSee(actor: Actor, projectCode: string | null | undefined, ownerUserId?: number | null): Promise<void> {
  if (!(await canSee(actor, projectCode, ownerUserId))) {
    throw new ForbiddenError("You can only access purchasing records on projects you are assigned to");
  }
}
