// apps/api/src/revisions/service.ts
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors.js";
import { revisions as revisionsTable } from "../db/schema/revisions.js";
import { orderByFor, paginate, resolveMeta, type PageRequest } from "../utils/pagination.js";
import { assertProjectWritable } from "../lifecycle/service.js";
import * as notificationsService from "../notifications/service.js";
import { openStoredFile } from "../uploads/service.js";
import { hasAllowedExtension, maxUploadBytes } from "../uploads/limits.js";
import { assignedCodesFor } from "../projects/scope.js";
import { projectCodesForPm } from "../projects/service.js";
import * as projectsRepo from "../projects/repository.js";
import * as repo from "./repository.js";
import {
  REVISION_READ_ROLES,
  assertTransition,
  normalizeItemType,
  type RevisionItemType,
} from "./rules.js";
import type {
  CreateRevisionInput,
  Revision,
  RevisionActor,
  RevisionDetail,
  RevisionFilters,
  RevisionSummary,
} from "./types.js";

/**
 * Projects the caller may see revisions for. null = no restriction (admin).
 * Architects and consultants: the projects they are assigned to. Project
 * managers: the projects they manage. Anyone else gets nothing.
 */
export const allowedProjectCodes = async (actor: RevisionActor): Promise<Set<string> | null> => {
  if (!(REVISION_READ_ROLES as readonly string[]).includes(actor.role)) {
    throw new ForbiddenError(`Role '${actor.role}' cannot view revisions`);
  }
  if (actor.role === "admin") return null;
  if (actor.role === "project-manager") {
    return projectCodesForPm({ role: actor.role, userId: actor.id, name: actor.name });
  }
  return assignedCodesFor({ id: actor.id, role: actor.role, name: actor.name });
};

const assertCanSee = (allowed: Set<string> | null, projectCode: string, what = "revisions") => {
  if (allowed && !allowed.has(projectCode)) {
    throw new ForbiddenError(`You can only access ${what} for projects you are assigned to`);
  }
};

export const list = async (
  filters: Omit<RevisionFilters, "projectCodes">,
  request: PageRequest,
  actor: RevisionActor,
) => {
  const allowed = await allowedProjectCodes(actor);
  const scoped: RevisionFilters = { ...filters, ...(allowed ? { projectCodes: [...allowed] } : {}) };
  // A caller with no projects sees nothing (an empty IN list would be invalid SQL).
  if (allowed && allowed.size === 0) {
    return { items: [] as Revision[], meta: resolveMeta(request, 0).meta };
  }
  const orderBy = orderByFor(request, repo.REVISION_SORT_COLUMNS, repo.defaultRevisionOrder, revisionsTable.id);
  return paginate(
    request,
    () => repo.countFiltered(scoped),
    ({ limit, offset }) => repo.findPage(scoped, limit, offset, orderBy),
  );
};

export const getById = async (id: number, actor: RevisionActor): Promise<RevisionDetail> => {
  const found = await repo.findDetail(id);
  if (!found) throw new NotFoundError("Revision", String(id));
  assertCanSee(await allowedProjectCodes(actor), found.detail.projectCode);
  return found.detail;
};

export const history = async (itemType: string, itemId: number, actor: RevisionActor): Promise<Revision[]> => {
  const type = normalizeItemType(itemType);
  const versions = await repo.findHistory(type, itemId);
  const allowed = await allowedProjectCodes(actor);
  // History belongs to one item, hence one project; check it from the first row.
  if (versions[0]) assertCanSee(allowed, versions[0].projectCode);
  return versions;
};

export const summary = async (actor: RevisionActor): Promise<RevisionSummary> => {
  const allowed = await allowedProjectCodes(actor);
  if (allowed && allowed.size === 0) return { total: 0, pending: 0, underReview: 0, approved: 0, rejected: 0 };
  return repo.summarize(allowed ? [...allowed] : undefined);
};

export const create = async (input: CreateRevisionInput, actor: RevisionActor): Promise<Revision> => {
  const project = await projectsRepo.findByCode(input.projectCode);
  if (!project) throw new ValidationError(`No project found with code "${input.projectCode}"`);

  // Architects only work on projects they are assigned to; admin is unrestricted.
  if (actor.role === "architect") {
    const mine = await assignedCodesFor({ id: actor.id, role: actor.role, name: actor.name });
    if (!mine.has(input.projectCode)) {
      throw new ForbiddenError("You can only add revisions to projects you are assigned to");
    }
  }
  await assertProjectWritable(input.projectCode);

  if (!hasAllowedExtension(input.file.fileName)) {
    throw new ValidationError(`Unsupported file type: ${input.file.fileName}`);
  }
  if (input.file.fileSize > maxUploadBytes()) {
    throw new ValidationError("The file is larger than the upload limit");
  }

  let itemTitle = input.newItem?.title ?? "";
  if (input.itemId != null) {
    const item = await repo.findItemRecord(input.itemType, input.itemId);
    if (!item) throw new NotFoundError(`${input.itemType[0]!.toUpperCase()}${input.itemType.slice(1)}`, String(input.itemId));
    if (item.projectCode !== input.projectCode) {
      throw new ValidationError(`That ${input.itemType} belongs to a different project`);
    }
    itemTitle = item.title;
  }

  const created = await repo.createVersion({
    projectCode: input.projectCode,
    architectId: actor.id,
    createdByName: actor.name,
    itemType: input.itemType,
    itemId: input.itemId,
    itemTitle,
    newPlan: input.newItem ? { title: input.newItem.title, owner: actor.name } : undefined,
    versionLabel: input.versionLabel,
    changeSummary: input.changeSummary,
    file: input.file,
  });

  await notificationsService.notifyProject(created.projectCode, ["project-manager", "consultant"], {
    title: "New revision submitted",
    body: `${created.itemTitle} — version ${created.versionNumber}${created.versionLabel ? ` (${created.versionLabel})` : ""} on ${created.projectCode}`,
    link: "/revisions",
  });
  return created;
};

export const setStatus = async (
  id: number,
  status: Revision["status"],
  comment: string | undefined,
  actor: RevisionActor,
): Promise<Revision> => {
  const found = await repo.findDetail(id);
  if (!found) throw new NotFoundError("Revision", String(id));
  const current = found.detail;
  assertCanSee(await allowedProjectCodes(actor), current.projectCode);

  assertTransition(current.status, status, actor.role, comment);
  if (!current.isCurrent) {
    throw new ValidationError("Only the current version of an item can be reviewed; this one has been replaced");
  }

  const isReview = actor.role !== "architect" || status !== "Submitted";
  const updated = await repo.setReview(id, {
    status,
    ...(isReview ? { reviewedBy: actor.name, reviewedByUserId: actor.id, reviewComment: comment } : {}),
  });
  if (!updated) throw new NotFoundError("Revision", String(id));

  if (isReview) {
    await notificationsService.create({
      recipientUserId: updated.architectId,
      projectCode: updated.projectCode,
      title: `Revision ${status.toLowerCase()}`,
      body: `${updated.itemTitle} — version ${updated.versionNumber} was marked ${status} by ${actor.name}`,
      link: "/revisions",
    });
  }
  return updated;
};

/** Both versions of one item, side by side, plus what changed between them. */
export const compare = async (leftId: number, rightId: number, actor: RevisionActor) => {
  if (leftId === rightId) throw new ValidationError("Choose two different versions to compare");
  const [left, right] = await Promise.all([getById(leftId, actor), getById(rightId, actor)]);
  if (left.itemType !== right.itemType || left.itemId !== right.itemId) {
    throw new ValidationError("Only versions of the same item can be compared");
  }
  const days = (a: Date | null, b: Date | null) =>
    a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) : null;
  return {
    left,
    right,
    diff: {
      versionGap: Math.abs(right.versionNumber - left.versionNumber),
      fileSizeDelta: right.fileSize - left.fileSize,
      sameFileName: left.fileName === right.fileName,
      sameFileType: left.mimeType === right.mimeType,
      statusChanged: left.status !== right.status,
      summaryChanged: left.changeSummary !== right.changeSummary,
      authorChanged: left.createdBy !== right.createdBy,
      daysBetween: days(left.createdAt, right.createdAt),
    },
  };
};

/** Opens the stored file after the same access check as the detail view. */
export const openFile = async (id: number, actor: RevisionActor) => {
  const found = await repo.findDetail(id);
  if (!found) throw new NotFoundError("Revision", String(id));
  assertCanSee(await allowedProjectCodes(actor), found.detail.projectCode);
  const file = await openStoredFile(found.fileUrl);
  return { file, revision: found.detail };
};

export type { RevisionItemType };
