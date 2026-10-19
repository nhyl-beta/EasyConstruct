// apps/api/src/requirements/permissions.ts
//
// Pure rules for what a Site Personnel user may do with requirements: draft
// them on projects they are staffed on and submit their OWN drafts for the
// PM's approval. Engineers/admins/PMs keep the behavior in service.ts.
//
// Limitation: requirements store createdBy as a display name, not a user id,
// so "own" is a case-insensitive name match against the signed-in user. Two
// people with the same name would be indistinguishable here.
import { ForbiddenError } from "../utils/errors.js";

const SP_CREATE_STATUSES = new Set(["Draft", "Under Review"]);
const SP_UPDATABLE_FIELDS = new Set(["title", "category", "description", "attachments", "status"]);

export const isOwnRequirement = (createdBy: string, actorName: string): boolean =>
  createdBy.trim().toLowerCase() === actorName.trim().toLowerCase();

export const assertSitePersonnelMayCreate = (
  data: { status?: string },
  isStaffedOnProject: boolean,
): void => {
  if (!isStaffedOnProject) {
    throw new ForbiddenError("You can only draft requirements on projects you are staffed on");
  }
  if (data.status && !SP_CREATE_STATUSES.has(data.status)) {
    throw new ForbiddenError(`Site personnel cannot create a requirement as '${data.status}'`);
  }
};

export const assertSitePersonnelMayUpdate = (
  existing: { createdBy: string; status: string },
  data: Record<string, unknown>,
  actorName: string,
  isStaffedOnProject: boolean,
): void => {
  if (!isOwnRequirement(existing.createdBy, actorName)) {
    throw new ForbiddenError("You can only change requirements you drafted yourself");
  }
  if (!isStaffedOnProject) {
    throw new ForbiddenError("You can only change requirements on projects you are staffed on");
  }
  if (existing.status !== "Draft") {
    throw new ForbiddenError("Only a draft requirement can be changed or submitted");
  }
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && !SP_UPDATABLE_FIELDS.has(key)) {
      throw new ForbiddenError(`Site personnel cannot change '${key}' on a requirement`);
    }
  }
  const status = data.status;
  if (status !== undefined && status !== "Draft" && status !== "Under Review") {
    throw new ForbiddenError(`Site personnel cannot set a requirement to '${String(status)}'`);
  }
};
