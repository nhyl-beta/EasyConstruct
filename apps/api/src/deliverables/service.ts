// apps/api/src/deliverables/service.ts
//
// Plan sets (project_deliverables) of a Design-delivery project: who leads each
// discipline, its sheet range and its status. Each plan set also reports the
// designs that belong to it and the open RFI/RFAs against its discipline.
import { and, asc, eq } from "drizzle-orm";
import { db } from "../core/db/connection.js";
import { designs } from "../core/db/schema/designs.js";
import { projectDeliverables, type ProjectDeliverable } from "../core/db/schema/project-deliverables.js";
import { designRequests } from "../core/db/schema/design-requests.js";
import { assertProjectWritable, refreshProjectProgress } from "../lifecycle/service.js";
import {
  canSetDeliverableStatus,
  deliverableForDiscipline,
  isDeliverableDiscipline,
  normalizeDeliveryType,
  REQUEST_CODE_TO_DELIVERABLE,
  STATUS_POINTS,
  type DeliverableStatus,
} from "../lifecycle/delivery.js";
import * as projectMemberRepo from "../project-members/repository.js";
import * as projectsRepo from "../projects/repository.js";
import { assertProjectVisible } from "../projects/service.js";
import { isOpenRequest } from "../design-requests/rules.js";
import { logAudit } from "../core/audit/audit.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../core/utils/errors.js";

export interface Actor {
  id: number;
  name: string;
  role: string;
}
const vis = (a: Actor) => ({ id: a.id, role: a.role, name: a.name });
const WRITERS = new Set(["project-manager", "architect", "consultant", "admin"]);

const requireDesignProject = async (projectCode: string) => {
  const project = await projectsRepo.findByCode(projectCode);
  if (!project) throw new NotFoundError("Project", projectCode);
  if (normalizeDeliveryType(project.deliveryType) !== "Design") {
    throw new ConflictError("Plan sets exist only on Design projects");
  }
  return project;
};

export const list = async (projectCode: string, actor: Actor) => {
  await assertProjectVisible(vis(actor), projectCode, "plan sets");
  const rows = await db.select().from(projectDeliverables).where(eq(projectDeliverables.projectCode, projectCode)).orderBy(asc(projectDeliverables.id));
  const [projectDesigns, requests] = await Promise.all([
    db.select({ id: designs.id, code: designs.code, name: designs.name, status: designs.status, discipline: designs.discipline, fileUrls: designs.fileUrls }).from(designs).where(eq(designs.projectCode, projectCode)),
    db.select().from(designRequests).where(eq(designRequests.projectCode, projectCode)),
  ]);
  const now = new Date();
  return rows.map((d) => {
    const linked = projectDesigns.filter((x) => deliverableForDiscipline(x.discipline) === d.discipline);
    const open = requests.filter((r) => REQUEST_CODE_TO_DELIVERABLE[r.discipline] === d.discipline && isOpenRequest(r.status));
    return {
      ...d,
      points: STATUS_POINTS[d.status as DeliverableStatus] ?? 0,
      designs: linked.map((x) => ({ id: x.id, code: x.code, name: x.name, status: x.status, fileCount: Array.isArray(x.fileUrls) ? x.fileUrls.length : 0 })),
      openRequests: open.map((r) => ({
        id: r.id,
        number: r.number,
        subject: r.subject,
        status: r.status,
        dueDate: r.dueDate,
        overdue: !!r.dueDate && (r.status === "open" || r.status === "in_review") && r.dueDate.getTime() < now.getTime(),
      })),
    };
  });
};

const requirePlanSet = async (id: number): Promise<ProjectDeliverable> => {
  const [row] = await db.select().from(projectDeliverables).where(eq(projectDeliverables.id, id));
  if (!row) throw new NotFoundError("Plan set", String(id));
  return row;
};

export const add = async (input: { projectCode: string; discipline: string }, actor: Actor) => {
  if (actor.role !== "project-manager" && actor.role !== "admin") throw new ForbiddenError("Only the PM can add a plan set");
  if (!isDeliverableDiscipline(input.discipline)) throw new ValidationError("Unknown discipline");
  await requireDesignProject(input.projectCode);
  await assertProjectVisible(vis(actor), input.projectCode, "plan sets");
  await assertProjectWritable(input.projectCode);
  const [dup] = await db.select().from(projectDeliverables).where(and(eq(projectDeliverables.projectCode, input.projectCode), eq(projectDeliverables.discipline, input.discipline)));
  if (dup) throw new ConflictError(`${input.discipline} already has a plan set on this project`);
  const [row] = await db.insert(projectDeliverables).values({ projectCode: input.projectCode, discipline: input.discipline }).returning();
  await refreshProjectProgress(input.projectCode);
  await logAudit({ entityType: "plan-set", entityId: String(row!.id), action: "created", actor: actor.name, summary: `${input.discipline} plan set added`, projectCode: input.projectCode });
  return row!;
};

export const update = async (
  id: number,
  patch: { sheetRange?: string | null; leadUserId?: number | null; status?: string },
  actor: Actor,
) => {
  if (!WRITERS.has(actor.role)) throw new ForbiddenError("You cannot change plan sets");
  const row = await requirePlanSet(id);
  await assertProjectVisible(vis(actor), row.projectCode, "plan sets");
  await assertProjectWritable(row.projectCode);

  const set: Partial<ProjectDeliverable> = {};
  if (patch.sheetRange !== undefined) {
    if (actor.role === "consultant") throw new ForbiddenError("The sheet range is set by the Architect or PM");
    set.sheetRange = patch.sheetRange?.trim() || null;
  }
  if (patch.leadUserId !== undefined) {
    if (actor.role === "consultant") throw new ForbiddenError("The lead is chosen by the Architect or PM");
    if (patch.leadUserId === null) {
      set.leadUserId = null;
      set.leadName = null;
    } else {
      const m = (await projectMemberRepo.findAll({ projectCode: row.projectCode, userId: patch.leadUserId })).find((x) => x.role === "architect");
      if (!m) throw new ValidationError("The lead must be an Architect staffed on this project");
      set.leadUserId = m.userId;
      set.leadName = m.userName;
    }
  }
  if (patch.status !== undefined) {
    if (!canSetDeliverableStatus(actor.role, row.status, patch.status)) {
      throw new ForbiddenError(`${actor.role} cannot move a plan set from ${row.status} to ${patch.status}`);
    }
    set.status = patch.status;
  }
  const [updated] = await db.update(projectDeliverables).set({ ...set, updatedAt: new Date() }).where(eq(projectDeliverables.id, id)).returning();
  await refreshProjectProgress(row.projectCode);
  await logAudit({
    entityType: "plan-set",
    entityId: String(id),
    action: patch.status ? "status-changed" : "updated",
    actor: actor.name,
    summary: `${row.discipline}${patch.status ? `: ${row.status} → ${patch.status}` : " updated"}`,
    projectCode: row.projectCode,
  });
  return updated!;
};
