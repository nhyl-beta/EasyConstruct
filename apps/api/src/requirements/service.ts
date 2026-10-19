import { db } from "../core/db/connection.js";
import { requirements } from "../core/db/schema/requirements.js";
import { projects } from "../core/db/schema/projects.js";
import { and, desc, eq, ilike, SQL } from "drizzle-orm";
import { ForbiddenError, NotFoundError, ValidationError } from "../core/utils/errors.js";
import { orNotFound } from "../core/utils/found.js";
import * as repo from "./repository.js";
import { loadDraftSources } from "./draft-repository.js";
import { generateDraft } from "./templates.js";
import { orderByFor, paginate, type PageRequest } from "../core/utils/pagination.js";
import * as projectMemberRepo from "../project-members/repository.js";
import { assertSitePersonnelMayCreate, assertSitePersonnelMayUpdate } from "./permissions.js";
import { assertProjectWritable, refreshProjectProgress } from "../lifecycle/service.js";
import * as notificationsService from "../notifications/service.js";
import * as projectsRepo from "../projects/repository.js";
import { isOwnProject } from "../projects/service.js";
import { decideAuthority, overrideSummary } from "../lifecycle/approval-authority.js";
import { logAudit } from "../core/audit/audit.js";
import type {
  CreateRequirementInput,
  UpdateRequirementInput,
  RequirementFilters,
} from "./types.js";

// The engineer who authors a requirement may move it as far as "Under
// Review" — asking for a decision — but deciding it (Approved/Rejected) is
// the Project Manager's call, same split as engineering reports.
export interface Actor {
  id: number;
  name: string;
  role: string;
}

const DECISION_STATUSES =new Set(["Approved", "Rejected"]);

/**
 * Approving or rejecting a requirement is the project's own PM's call. An Admin can do it only as an override
 * with a written reason (at least 10 characters), recorded in the audit trail (client demo change #9).
 */
const assertCanSetStatus = async (
  status: string | undefined,
  actor: { id?: number; name?: string; role: string } | undefined,
  actorRole: string,
  projectCode: string | undefined,
  overrideReason: string | undefined,
) => {
  if (!status || !DECISION_STATUSES.has(status)) return null;
  const project = projectCode ? await projectsRepo.findByCode(projectCode) : null;
  const isProjectPm = !!project && !!actor?.id && isOwnProject(project, { role: actorRole, userId: actor.id, name: actor.name });
  const authority = decideAuthority({ role: actorRole, isProjectPm, overrideReason, action: `set a requirement to ${status}` });
  return authority.override ? authority : null;
};

// The filter logic lives in repository.ts (one copy, shared with the paged read).
export const findAll = async (filters: RequirementFilters = {}) => repo.findAll(filters);

export const statusCounts = (filters: RequirementFilters) => repo.statusCounts(filters);

export const getPage = async (filters: RequirementFilters, request: PageRequest) =>
  paginate(
    request,
    () => repo.countFiltered(filters),
    (window) => repo.findPage(filters, window, orderByFor(request, repo.REQUIREMENT_SORT_COLUMNS, repo.defaultRequirementOrder, requirements.id)),
  );

export const findById = async (id: number) => {
  const [row] = await db.select().from(requirements).where(eq(requirements.id, id));
  return row ?? null;
};

// G: is this user staffed on the project as site personnel? (project_members)
const isStaffedSitePersonnel = async (projectCode: string, userId: number) =>
  (await projectMemberRepo.findAll({ projectCode, userId, role: "site-personnel" })).length > 0;

export const create = async (data: CreateRequirementInput, actor?: Actor) => {
  const [project] = await db.select().from(projects).where(eq(projects.code, data.project));
  if (!project) {
    throw new ValidationError(`No project found with code "${data.project}"`);
  }
  if (actor?.role === "site-personnel") {
    assertSitePersonnelMayCreate(data, await isStaffedSitePersonnel(data.project, actor.id));
    // The author is always the signed-in user, whatever the client sent.
    data = { ...data, createdBy: actor.name };
  }
  await assertProjectWritable(data.project);
  const requirementId =
    data.requirementId ??
    `REQ-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const [created] = await db
    .insert(requirements)
    .values({ ...data, requirementId })
    .returning();
  if (!created) throw new Error("Failed to create requirement");
  await refreshProjectProgress(created.project);
  return created;
};

export const update = async (
  id: number,
  data: UpdateRequirementInput,
  actorRole: string,
  actor?: Actor,
) => {
  const { overrideReason, ...fields } = data as UpdateRequirementInput & { overrideReason?: string };
  data = fields;
  const existing = await findById(id);
  const override = await assertCanSetStatus(data.status, actor, actorRole, existing?.project, overrideReason);
  if (actorRole === "site-personnel") {
    // G: site personnel may only change/submit their own drafts.
    if (!existing) throw new NotFoundError("Requirement", String(id));
    if (!actor) throw new ForbiddenError("Cannot identify the signed-in user");
    assertSitePersonnelMayUpdate(
      existing,
      data as Record<string, unknown>,
      actor.name,
      await isStaffedSitePersonnel(existing.project, actor.id),
    );
  }
  if (existing) await assertProjectWritable(existing.project);

  // Submitting for approval needs evidence on file. New requirements can't be
  // created without a file, but older drafts can be empty — those have to be
  // given one (in the same request or before) before they can be submitted.
  if (data.status === "Under Review") {
    const files = data.attachments ?? existing?.attachments ?? [];
    if (files.length === 0) {
      throw new ValidationError("Attach at least one file before submitting this requirement for review");
    }
  }
  const [updated] = await db
    .update(requirements)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(requirements.id, id))
    .returning();
  if (updated) {
    if (override && actor) {
      await logAudit({
        entityType: "requirement",
        entityId: String(updated.id),
        action: "override",
        actor: actor.name,
        summary: overrideSummary(`set requirement "${updated.title}" to ${updated.status}`, override.reason),
        projectCode: updated.project,
      });
    }
    await refreshProjectProgress(updated.project);
    // J2: requirements has no author userId (createdBy is a display name),
    // so this reaches whoever is actually staffed as engineer on the
    // project rather than the specific author.
    // Submitted for approval: tell the project's PM it is waiting on them.
    if (data.status === "Under Review" && existing?.status !== "Under Review") {
      await notificationsService.notifyProject(updated.project, ["project-manager"], {
        title: "Requirement awaiting your approval",
        body: `"${updated.title}" was submitted for review on ${updated.project}`,
        link: "/approvals",
      });
    }
    if (data.status && DECISION_STATUSES.has(data.status)) {
      await notificationsService.notifyProject(updated.project, ["engineer"], {
        title: `Requirement ${data.status.toLowerCase()}`,
        body: `"${updated.title}" was ${data.status.toLowerCase()} on ${updated.project}`,
        link: `/projects/${encodeURIComponent(updated.project)}`,
      });
    }
  }
  // Nothing matched: the id does not exist. Reported as 404, not a success with an empty body.
  return orNotFound(updated, "Requirement", id);
};

export const remove = async (id: number) => {
  const [deleted] = await db.delete(requirements).where(eq(requirements.id, id)).returning();
  const removed = orNotFound(deleted, "Requirement", id);
  await refreshProjectProgress(removed.project);
  return removed;
};

/** Rule-based draft for the Engineer to edit (fix 3.4). Read-only: nothing is saved. */
export const generateDraftFor = async (projectCode: string, category: string) => {
  const { project, proposalText, designText } = await loadDraftSources(projectCode);
  if (!project) throw new NotFoundError("Project", projectCode);
  return generateDraft({
    projectCode,
    projectName: project.name,
    projectType: project.projectType,
    category,
    proposalText,
    designText,
  });
};
