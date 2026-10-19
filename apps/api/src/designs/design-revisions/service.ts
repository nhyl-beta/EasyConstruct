// service.ts
import * as repo from "./repository.js";
import * as designsRepo from "../repository.js";
import * as projectsRepo from "../../projects/repository.js";
import * as projectsService from "../../projects/service.js";
import { assertProjectWritable } from "../../lifecycle/service.js";
import { logAudit } from "../../utils/audit.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import type {
  CreateDesignRevisionInput,
  DesignRevisionDetail,
  DesignRevisionFilters,
  DesignRevisionSummary,
  RevisionActor,
  UpdateDesignRevisionInput,
} from "./types.js";

type Scope = { role: string; userId: number; name?: string } | undefined;

const AWAITING = new Set(["Draft", "Under Review", "Submitted"]);

export const summarize = (items: DesignRevisionDetail[]): DesignRevisionSummary => {
  const byStatus: Record<string, number> = {};
  for (const r of items) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const newest = items[0]; // findDetailed orders newest first
  return {
    total: items.length,
    designsWithRevisions: new Set(items.map((r) => r.designId)).size,
    latestVersion: newest?.version ?? null,
    latestChangeAt: newest?.createdAt ?? null,
    awaitingApproval: items.filter((r) => AWAITING.has(r.status)).length,
    byStatus,
  };
};

/** Revisions the caller may see (their projects only), optionally narrowed. */
export const getAll = async (filters: DesignRevisionFilters, scope?: Scope) =>
  repo.findDetailed({ ...filters, projectCodes: await projectsService.visibleProjectCodes(scope) });

/** Revisions of one project, with a summary. Visibility is the project's own (403/404 as for the project). */
export const getByProject = async (projectCode: string, scope: Scope, filters: Omit<DesignRevisionFilters, "projectCode"> = {}) => {
  const project = await projectsRepo.findByCode(projectCode);
  if (!project) throw new NotFoundError("Project", projectCode);
  await projectsService.getById(project.id, scope); // reuses the project visibility rules
  const all = await repo.findByProjectCode(projectCode);
  const items = filters.designId || filters.status ? await repo.findByProjectCode(projectCode, filters) : all;
  return { items, summary: summarize(all) };
};

/** 403 unless the caller may see the project this design belongs to. */
export const assertCanSeeDesign = async (designId: number, scope: Scope) => {
  const design = await designsRepo.findById(designId);
  if (!design) throw new NotFoundError("Design", String(designId));
  const codes = await projectsService.visibleProjectCodes(scope);
  if (codes && !codes.has(design.projectCode)) {
    throw new ForbiddenError("You can only access design revisions for projects you are assigned to");
  }
  return design;
};

export const getById = async (id: number) => {
  const rev = await repo.findById(id);
  if (!rev) throw new NotFoundError("Design revision", String(id));
  return rev;
};

/**
 * Creates a revision: lifecycle write lock, duplicate-version 409, revision
 * numbering, parentVersion defaulting, designs.version/revision update (one
 * transaction), approvedAt, author from the session, audit entry.
 * `internal.bypassLock` is for the demo generator only (it must be able to
 * decorate archived demo projects) and is never reachable from a request body.
 */
export const create = async (
  input: CreateDesignRevisionInput,
  actor?: RevisionActor,
  internal: { bypassLock?: boolean } = {},
) => {
  const design = await designsRepo.findById(input.designId);
  if (!design) throw new NotFoundError("Design", String(input.designId));
  if (!internal.bypassLock) await assertProjectWritable(design.projectCode);

  // Callers other than Admin cannot sign a revision with someone else's name.
  const createdBy = actor && actor.role !== "admin" ? actor.name : input.createdBy;
  const { created, duplicate } = await repo.createForDesign({
    ...input,
    createdBy,
    isDemo: internal.bypassLock ? input.isDemo : false,
    createdAt: internal.bypassLock ? input.createdAt : undefined,
    approvedAt: internal.bypassLock ? input.approvedAt : undefined,
  });
  if (duplicate) {
    throw new ConflictError(`Design ${design.code} already has a revision with version ${input.version}`);
  }
  await logAudit({
    entityType: "design-revision",
    entityId: String(created.id),
    action: "created",
    actor: actor?.name ?? createdBy,
    summary: `${design.code} ${created.parentVersion ?? "—"} → ${created.version} (Rev ${created.revisionNumber}, ${created.status})${created.isDemo ? " [demo data]" : ""}`,
    projectCode: design.projectCode,
  });
  return created;
};

export const update = async (id: number, input: UpdateDesignRevisionInput, actor?: RevisionActor) => {
  const existing = await getById(id);
  const design = await designsRepo.findById(existing.designId);
  if (design) await assertProjectWritable(design.projectCode);
  const patch: UpdateDesignRevisionInput = { ...input };
  delete patch.designId;
  delete patch.isDemo;
  delete patch.createdAt;
  if (patch.status === "Approved" && !existing.approvedAt && !patch.approvedAt) patch.approvedAt = new Date();
  const updated = await repo.update(id, patch);
  if (!updated) throw new NotFoundError("Design revision", String(id));
  if (patch.status && patch.status !== existing.status) {
    await logAudit({
      entityType: "design-revision",
      entityId: String(id),
      action: "status-changed",
      actor: actor?.name ?? "system",
      summary: `${design?.code ?? existing.designId} ${existing.version}: ${existing.status} → ${patch.status}`,
      projectCode: design?.projectCode,
    });
  }
  return updated;
};

export const remove = async (id: number, actor?: RevisionActor) => {
  const existing = await getById(id);
  const design = await designsRepo.findById(existing.designId);
  if (design) await assertProjectWritable(design.projectCode);
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError("Design revision", String(id));
  await logAudit({
    entityType: "design-revision",
    entityId: String(id),
    action: "deleted",
    actor: actor?.name ?? "system",
    summary: `${design?.code ?? existing.designId} ${existing.version} removed`,
    projectCode: design?.projectCode,
  });
  return deleted;
};
