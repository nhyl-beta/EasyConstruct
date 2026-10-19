import { db } from "../../db/connection.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { logAudit } from "../../utils/audit.js";
import { assertProjectWritable } from "../../lifecycle/service.js";
import * as requirementsRepo from "../../requirements/repository.js";
import { resolveActiveCategory, resolveCategoryChange } from "../categories/service.js";
import {
  assertCanSee,
  isFinance,
  isProjectPm,
  loadProject,
  staffing,
  visibleCodes,
  type Actor,
} from "../purchasing/access.js";
import { adjustCommitted, findBudgetLine } from "../purchasing/booking.js";
import { nextId } from "../purchasing/ids.js";
import { links, toFinance, toProject, toUser } from "../purchasing/notify.js";
import {
  OVER_BUDGET_WARNING,
  assertDecisionNote,
  assertNotSelf,
  assertTransition,
  assertValidLineItems,
  budgetImpact,
  isOverBudget,
  lineItemsTotal,
  prStatusAfterRaise,
} from "../purchasing/rules.js";
import { purchaseRequestsRepository as repo, type PurchaseRequestRow } from "./repository.js";
import type { PurchaseLineItem } from "../../db/schema/finance.js";

export interface CreatePurchaseRequestInput {
  requirementId: number;
  title: string;
  category: string;
  lineItems: PurchaseLineItem[];
  neededBy?: string;
  justification?: string;
  preferredVendor?: string;
}

const ENTITY = "purchase-request";

async function mustFind(id: string): Promise<PurchaseRequestRow> {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError("Purchase request", id);
  return row;
}

/** A conditional update found nothing: say which status the request is in now. */
async function lost(id: string, wanted: string): Promise<never> {
  const current = await mustFind(id);
  throw new ConflictError(`${id} is ${current.status}; it can no longer be ${wanted}`);
}

const link = (tab: "purchase-requests") => links.finance(tab);

export const purchaseRequestsService = {
  /** Raise a request from an Approved requirement. Engineer: staffed on it. PM: its own PM. Admin: any. */
  async create(actor: Actor, input: CreatePurchaseRequestInput) {
    const requirement = await requirementsRepo.findById(input.requirementId);
    if (!requirement) throw new NotFoundError("Requirement", String(input.requirementId));
    if (requirement.status !== "Approved") {
      throw new ConflictError("Only an approved requirement can be turned into a purchase request");
    }
    const category = await resolveActiveCategory(input.category);

    const project = await loadProject(requirement.project);
    await assertProjectWritable(project.code);
    if (actor.role === "engineer") {
      if (!(await staffing(actor, project.code, ["engineer"]))) {
        throw new ForbiddenError("You can only raise purchase requests on projects you are staffed on");
      }
    } else if (actor.role === "project-manager") {
      if (!isProjectPm(project, actor)) throw new ForbiddenError("You can only raise purchase requests on your own projects");
    } else if (actor.role !== "admin") {
      throw new ForbiddenError("Your role cannot raise purchase requests");
    }

    assertValidLineItems(input.lineItems);
    const live = await repo.findLiveForRequirement(requirement.id);
    if (live.length > 0) {
      throw new ConflictError(`${live[0]!.id} already covers this requirement and is ${live[0]!.status}`);
    }

    const status = prStatusAfterRaise(actor.role);
    const amount = lineItemsTotal(input.lineItems);
    const id = await nextId("PR", db);
    const row = await repo.insert({
      id,
      title: input.title,
      project: project.code,
      requestedBy: actor.name,
      amount,
      status,
      category,
      requirementId: requirement.id,
      lineItems: input.lineItems,
      neededBy: input.neededBy ?? null,
      justification: input.justification ?? null,
      preferredVendor: input.preferredVendor ?? null,
      requestedByUserId: actor.id,
      requestedByRole: actor.role,
    });

    await logAudit({
      entityType: ENTITY,
      entityId: id,
      action: "raised",
      actor: actor.name,
      summary: `${input.title} · ${amount.toFixed(2)} · ${status}`,
      projectCode: project.code,
    });
    const m = { title: status === "pending-pm" ? "Purchase request to endorse" : "Purchase request awaiting approval", body: `${id} · ${input.title} (${project.code}) raised by ${actor.name}.` };
    if (status === "pending-pm") await toProject(project.code, ["project-manager"], { ...m, link: links.approvals });
    else await toFinance(project.code, { ...m, link: link("purchase-requests") });
    return row;
  },

  async list(actor: Actor, status?: string) {
    const [rows, codes] = await Promise.all([repo.findAll(), visibleCodes(actor)]);
    return rows.filter(
      (r) =>
        (!status || r.status === status) &&
        (r.requestedByUserId === actor.id || codes === null || codes.has(r.project)),
    );
  },

  /** The request with the budget effect of committing it (null when there is no matching budget line). */
  async detail(actor: Actor, id: string) {
    const row = await mustFind(id);
    await assertCanSee(actor, row.project, row.requestedByUserId);
    const line = row.category ? await findBudgetLine(db, row.project, row.category) : null;
    // Once it is approved its own amount sits in `committed`; show the line without it.
    const own = row.status === "approved" ? row.committedAmount : 0;
    const base = line ? { planned: line.planned, committed: Math.max(0, line.committed - own), actual: line.actual } : null;
    return { ...row, budgetImpact: budgetImpact(base, row.amount) };
  },

  /** The requester edits while it is still waiting for the PM. */
  async update(actor: Actor, id: string, patch: Partial<Omit<CreatePurchaseRequestInput, "requirementId">>) {
    const row = await mustFind(id);
    if (row.requestedByUserId !== actor.id) throw new ForbiddenError("Only the requester can edit this request");
    if (row.status !== "pending-pm") throw new ConflictError(`${id} is ${row.status}; it can only be edited while it waits for the PM`);
    const values: Partial<PurchaseRequestRow> = {};
    if (patch.title !== undefined) values.title = patch.title;
    // Checked against the live list only when the value actually changes: a request
    // whose category was retired since can still be edited for other fields.
    if (patch.category !== undefined) {
      const category = await resolveCategoryChange(row.category, patch.category);
      if (category !== null) values.category = category;
    }
    if (patch.neededBy !== undefined) values.neededBy = patch.neededBy;
    if (patch.justification !== undefined) values.justification = patch.justification;
    if (patch.preferredVendor !== undefined) values.preferredVendor = patch.preferredVendor;
    if (patch.lineItems !== undefined) {
      assertValidLineItems(patch.lineItems);
      values.lineItems = patch.lineItems;
      values.amount = lineItemsTotal(patch.lineItems);
    }
    const updated = await repo.transition(id, ["pending-pm"], values);
    if (!updated) return lost(id, "edited");
    await logAudit({ entityType: ENTITY, entityId: id, action: "edited", actor: actor.name, projectCode: row.project });
    return updated;
  },

  /** The project's PM (or Admin) passes an Engineer's request to Finance. */
  async endorse(actor: Actor, id: string) {
    const row = await mustFind(id);
    const project = await loadProject(row.project);
    if (actor.role !== "admin" && !isProjectPm(project, actor)) throw new ForbiddenError("Only this project's Project Manager can endorse");
    assertNotSelf(actor.id, row.requestedByUserId, "endorse");
    assertTransition("purchase-request", id, row.status, "pending-finance");
    await assertProjectWritable(row.project);
    const updated = await repo.transition(id, ["pending-pm"], {
      status: "pending-finance",
      endorsedBy: actor.name,
      endorsedAt: new Date(),
    });
    if (!updated) return lost(id, "endorsed");
    await logAudit({ entityType: ENTITY, entityId: id, action: "endorsed", actor: actor.name, projectCode: row.project });
    await toFinance(row.project, { title: "Purchase request awaiting approval", body: `${id} · ${row.title} (${row.project}) was endorsed by ${actor.name}.`, link: link("purchase-requests") });
    return updated;
  },

  /**
   * Finance approval. ONE transaction: the status moves, the amount is
   * committed on the matching budget line (atomic SQL). Over budget (or no
   * matching line) needs a decision note and sets `overBudget`; it warns, it
   * does not block.
   */
  async approve(actor: Actor, id: string, note?: string) {
    const row = await mustFind(id);
    if (!isFinance(actor)) throw new ForbiddenError("Only Finance can approve");
    assertNotSelf(actor.id, row.requestedByUserId, "approve");
    assertTransition("purchase-request", id, row.status, "approved");
    await assertProjectWritable(row.project);

    const line = row.category ? await findBudgetLine(db, row.project, row.category) : null;
    const over = isOverBudget(line, row.amount);
    assertDecisionNote("approve", over, note);

    const updated = await db.transaction(async (tx) => {
      const r = await repo.transition(
        id,
        ["pending-finance"],
        {
          status: "approved",
          decidedBy: actor.name,
          decidedAt: new Date(),
          decisionNote: note?.trim() || null,
          overBudget: over,
          committedAmount: row.amount,
        },
        tx,
      );
      if (!r) return undefined;
      if (r.category) await adjustCommitted(tx, r.project, r.category, r.amount);
      return r;
    });
    if (!updated) return lost(id, "approved");

    await logAudit({ entityType: ENTITY, entityId: id, action: "approved", actor: actor.name, summary: over ? "over budget" : undefined, projectCode: row.project });
    const msg = { title: "Purchase request approved", body: `${id} · ${row.title} was approved by ${actor.name}.`, link: links.requirements };
    await toUser(row.requestedByUserId, row.project, msg, actor.id);
    await toProject(row.project, ["project-manager"], { ...msg, link: links.approvals });
    return { ...updated, warning: over ? OVER_BUDGET_WARNING : null };
  },

  /** The PM may reject while it waits for them; Finance while it waits for Finance. */
  async reject(actor: Actor, id: string, note?: string) {
    const row = await mustFind(id);
    assertNotSelf(actor.id, row.requestedByUserId, "reject");
    assertTransition("purchase-request", id, row.status, "rejected");
    if (row.status === "pending-pm") {
      const project = await loadProject(row.project);
      if (actor.role !== "admin" && !isProjectPm(project, actor)) throw new ForbiddenError("Only this project's Project Manager can reject at this step");
    } else if (!isFinance(actor)) {
      throw new ForbiddenError("Only Finance can reject at this step");
    }
    assertDecisionNote("reject", false, note);
    await assertProjectWritable(row.project);

    const updated = await repo.transition(id, [row.status], {
      status: "rejected",
      decidedBy: actor.name,
      decidedAt: new Date(),
      decisionNote: note!.trim(),
    });
    if (!updated) return lost(id, "rejected");
    await logAudit({ entityType: ENTITY, entityId: id, action: "rejected", actor: actor.name, summary: note, projectCode: row.project });
    const msg = { title: "Purchase request rejected", body: `${id} · ${row.title} was rejected by ${actor.name}: ${note}`, link: links.requirements };
    await toUser(row.requestedByUserId, row.project, msg, actor.id);
    if (row.status === "pending-finance") await toProject(row.project, ["project-manager"], { ...msg, link: links.approvals });
    return updated;
  },

  /** The requester, the project's PM or Finance cancel; not once it is ordered. Releases any commitment. */
  async cancel(actor: Actor, id: string) {
    const row = await mustFind(id);
    const project = await loadProject(row.project);
    const allowed = row.requestedByUserId === actor.id || isFinance(actor) || isProjectPm(project, actor);
    if (!allowed) throw new ForbiddenError("Only the requester, the project's PM or Finance can cancel");
    assertTransition("purchase-request", id, row.status, "cancelled");
    await assertProjectWritable(row.project);

    const updated = await db.transaction(async (tx) => {
      const r = await repo.transition(id, [row.status], { status: "cancelled", committedAmount: 0 }, tx);
      if (!r) return undefined;
      // Only an approved request holds money.
      if (row.status === "approved" && row.category && row.committedAmount > 0) {
        await adjustCommitted(tx, row.project, row.category, -row.committedAmount);
      }
      return r;
    });
    if (!updated) return lost(id, "cancelled");
    await logAudit({ entityType: ENTITY, entityId: id, action: "cancelled", actor: actor.name, projectCode: row.project });
    return updated;
  },
};
