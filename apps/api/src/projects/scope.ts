// apps/api/src/projects/scope.ts
//
// Reusable "only my projects" scoping. Architect and Consultant are limited to the projects they
// are staffed on (project_members; the membership row's role is expected to equal the account
// role). A Project Manager is limited to the projects they manage. Adopting it for another role
// is a change to ASSIGNED_SCOPED_ROLES.
//
// The core (filterRowsByCodes / canAccessCode) is pure so it can be tested
// without a database; the exported helpers add the membership lookup.
import * as projectMemberRepo from "../project-members/repository.js";
import { ForbiddenError } from "../core/utils/errors.js";
import * as designsRepo from "../designs/repository.js";
import { projectCodesForPm } from "./service.js";

export interface ScopeAuth {
  id: number;
  role: string;
  name?: string;
}

/** Roles whose reads and writes are limited to their own projects (staffed on, or managed). */
export const ASSIGNED_SCOPED_ROLES: ReadonlySet<string> = new Set(["architect", "consultant", "project-manager"]);

export const isAssignedScoped = (auth: ScopeAuth | undefined): auth is ScopeAuth =>
  !!auth && ASSIGNED_SCOPED_ROLES.has(auth.role);

export const filterRowsByCodes = <T>(
  rows: T[],
  codes: ReadonlySet<string>,
  codeOf: (row: T) => string | null | undefined,
): T[] =>
  rows.filter((row) => {
    const code = codeOf(row);
    return !!code && codes.has(code);
  });

export const canAccessCode = (codes: ReadonlySet<string>, code: string | null | undefined): boolean =>
  !!code && codes.has(code);

/** Project codes this user is assigned to in their own role (a PM: the projects they manage). */
export const assignedCodesFor = async (auth: ScopeAuth): Promise<Set<string>> => {
  if (auth.role === "project-manager") {
    return projectCodesForPm({ role: auth.role, userId: auth.id, name: auth.name ?? "" });
  }
  const rows = await projectMemberRepo.findAll({ userId: auth.id, role: auth.role as never });
  return new Set(rows.map((r) => r.projectCode));
};

/** Narrows project-scoped rows for assigned-scoped roles; everyone else passes through. */
export const scopeRowsToAssigned = async <T>(
  auth: ScopeAuth | undefined,
  rows: T[],
  codeOf: (row: T) => string | null | undefined,
): Promise<T[]> => {
  if (!isAssignedScoped(auth)) return rows;
  return filterRowsByCodes(rows, await assignedCodesFor(auth), codeOf);
};

/** Throws 403 when an assigned-scoped caller touches a project they are not assigned to. */
export const assertAssignedToProject = async (
  auth: ScopeAuth | undefined,
  projectCode: string | null | undefined,
  what = "this project",
): Promise<void> => {
  if (!isAssignedScoped(auth)) return;
  if (!canAccessCode(await assignedCodesFor(auth), projectCode)) {
    throw new ForbiddenError(`You can only access ${what} for projects you are assigned to`);
  }
};

/**
 * Rows that belong to a project through a design (reviews, revisions,
 * architect documents) or directly (blueprints): the project code is the
 * row's own when it has one, else its design's.
 */
export const scopeRowsByDesign = async <T>(
  auth: ScopeAuth | undefined,
  rows: T[],
  designIdOf: (row: T) => number | null | undefined,
  ownCodeOf: (row: T) => string | null | undefined = () => null,
): Promise<T[]> => {
  if (!isAssignedScoped(auth)) return rows;
  const designIds = rows
    .map((row) => designIdOf(row))
    .filter((id): id is number => id != null);
  const [codes, codeByDesign] = await Promise.all([
    assignedCodesFor(auth),
    designsRepo.findProjectCodesByIds(designIds),
  ]);
  return filterRowsByCodes(rows, codes, (row) => {
    const own = ownCodeOf(row);
    if (own) return own;
    const designId = designIdOf(row);
    return designId != null ? codeByDesign.get(designId) : null;
  });
};

/** Project code of a design, for by-id checks on rows that only know their design. */
export const assertAssignedToDesign = async (
  auth: ScopeAuth | undefined,
  designId: number | null | undefined,
  what = "this item",
): Promise<void> => {
  if (!isAssignedScoped(auth)) return;
  const design = designId != null ? await designsRepo.findById(designId) : null;
  await assertAssignedToProject(auth, design?.projectCode, what);
};
