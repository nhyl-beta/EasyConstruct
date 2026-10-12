import { db } from "../../db/connection.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { logAudit } from "../../utils/audit.js";
import { assertProjectWritable } from "../../lifecycle/service.js";
import { resolveActiveCategory } from "../categories/service.js";
import type { ClaimAttachment } from "../../db/schema/finance.js";
import {
  isFinance,
  isProjectPm,
  loadProject,
  projectHasPm,
  staffing,
  visibleCodes,
  type Actor,
} from "../purchasing/access.js";
import { applyApprovedSpend } from "../purchasing/booking.js";
import { nextId } from "../purchasing/ids.js";
import { claimLink, links, toFinance, toProject, toUser } from "../purchasing/notify.js";
import { assertDecisionNote, assertNotSelf, assertTransition, claimStatusAfterRaise } from "../purchasing/rules.js";
import { expensesRepository } from "../expenses/repository.js";
import { annotateSpendExpense } from "../expenses/services.js";
import { reimbursementsRepository as repo, type ReimbursementRow } from "./repository.js";

const ENTITY = "reimbursement";
const finLink = links.finance("reimbursements");

export interface CreateClaimInput {
  project: string;
  category: string;
  incurredOn: string;
  purpose: string;
  amount: number;
  attachments: ClaimAttachment[];
}

async function mustFind(id: string): Promise<ReimbursementRow> {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError("Reimbursement claim", id);
  return row;
}

async function lost(id: string, wanted: string): Promise<never> {
  const current = await mustFind(id);
  throw new ConflictError(`${id} is ${current.status}; it can no longer be ${wanted}`);
}

/** Claims are private: the claimant, Finance / Admin, and the PM of the claim's project. */
async function assertMayView(actor: Actor, row: ReimbursementRow): Promise<void> {
  if (row.claimantUserId === actor.id || isFinance(actor)) return;
  if (actor.role === "project-manager" && row.project && isProjectPm(await loadProject(row.project), actor)) return;
  throw new ForbiddenError("You cannot view this claim");
}

export const reimbursementsService = {
  /** A claim needs a receipt. Project staff on a project with a PM go to that PM first. */
  async create(actor: Actor, input: CreateClaimInput) {
    const category = await resolveActiveCategory(input.category);
    if (input.attachments.length === 0) throw new ValidationError("At least one receipt is required");
    const project = await loadProject(input.project);
    await assertProjectWritable(project.code);

    const status = claimStatusAfterRaise({
      staffedOnProject: !!(await staffing(actor, project.code)),
      projectHasPm: projectHasPm(project),
      isProjectPm: isProjectPm(project, actor),
    });
    const id = await nextId("RMB", db);
    const row = await repo.insert({
      id,
      employee: actor.name,
      purpose: input.purpose,
      amount: input.amount,
      status,
      claimantUserId: actor.id,
      claimantRole: actor.role,
      project: project.code,
      category,
      incurredOn: input.incurredOn,
      attachments: input.attachments,
    });

    await logAudit({ entityType: ENTITY, entityId: id, action: "submitted", actor: actor.name, summary: `${input.purpose} · ${input.amount.toFixed(2)} · ${status}`, projectCode: project.code });
    const msg = { title: status === "pending-pm" ? "Claim to endorse" : "Claim awaiting approval", body: `${id} · ${input.purpose} (${project.code}) from ${actor.name}.` };
    if (status === "pending-pm") await toProject(project.code, ["project-manager"], { ...msg, link: links.approvals });
    else await toFinance(project.code, { ...msg, link: finLink });
    return row;
  },

  /** Finance / Admin see every claim; a PM the claims on their projects. */
  async list(actor: Actor, status?: string) {
    const [rows, codes] = await Promise.all([repo.findAll(), visibleCodes(actor)]);
    return rows.filter((r) => (!status || r.status === status) && (codes === null || (!!r.project && codes.has(r.project))));
  },

  mine: (actor: Actor) => repo.findByClaimant(actor.id),

  async detail(actor: Actor, id: string) {
    const row = await mustFind(id);
    await assertMayView(actor, row);
    return row;
  },

  async endorse(actor: Actor, id: string) {
    const row = await mustFind(id);
    if (!row.project) throw new ValidationError("This claim has no project");
    const project = await loadProject(row.project);
    if (actor.role !== "admin" && !isProjectPm(project, actor)) throw new ForbiddenError("Only this project's Project Manager can endorse");
    assertNotSelf(actor.id, row.claimantUserId, "endorse");
    assertTransition("reimbursement", id, row.status, "pending-finance");
    await assertProjectWritable(row.project);
    const updated = await repo.transition(id, ["pending-pm"], { status: "pending-finance", endorsedBy: actor.name, endorsedAt: new Date() });
    if (!updated) return lost(id, "endorsed");
    await logAudit({ entityType: ENTITY, entityId: id, action: "endorsed", actor: actor.name, projectCode: row.project });
    await toFinance(row.project, { title: "Claim awaiting approval", body: `${id} · ${row.purpose} was endorsed by ${actor.name}.`, link: finLink });
    await toUser(row.claimantUserId, row.project, { title: "Claim endorsed", body: `${id} was endorsed by ${actor.name} and now waits for Finance.`, link: claimLink(row.claimantRole) }, actor.id);
    return updated;
  },

  async approve(actor: Actor, id: string, note?: string) {
    const row = await mustFind(id);
    if (!isFinance(actor)) throw new ForbiddenError("Only Finance can approve");
    assertNotSelf(actor.id, row.claimantUserId, "approve");
    assertTransition("reimbursement", id, row.status, "approved");
    if (row.project) await assertProjectWritable(row.project);
    const updated = await repo.transition(id, ["pending-finance"], {
      status: "approved",
      decidedBy: actor.name,
      decidedAt: new Date(),
      decisionNote: note?.trim() || null,
    });
    if (!updated) return lost(id, "approved");
    await logAudit({ entityType: ENTITY, entityId: id, action: "approved", actor: actor.name, projectCode: row.project ?? undefined });
    await toUser(row.claimantUserId, row.project ?? undefined, { title: "Claim approved", body: `${id} was approved by ${actor.name}; payment is next.`, link: claimLink(row.claimantRole) }, actor.id);
    return updated;
  },

  /** The PM rejects while it waits for them; Finance while it waits for Finance. Never your own claim. */
  async reject(actor: Actor, id: string, note?: string) {
    const row = await mustFind(id);
    assertNotSelf(actor.id, row.claimantUserId, "reject");
    assertTransition("reimbursement", id, row.status, "rejected");
    if (row.status === "pending-pm") {
      if (!row.project) throw new ValidationError("This claim has no project");
      if (actor.role !== "admin" && !isProjectPm(await loadProject(row.project), actor)) {
        throw new ForbiddenError("Only this project's Project Manager can reject at this step");
      }
    } else if (!isFinance(actor)) {
      throw new ForbiddenError("Only Finance can reject at this step");
    }
    assertDecisionNote("reject", false, note);
    if (row.project) await assertProjectWritable(row.project);
    const updated = await repo.transition(id, [row.status], {
      status: "rejected",
      decidedBy: actor.name,
      decidedAt: new Date(),
      decisionNote: note!.trim(),
    });
    if (!updated) return lost(id, "rejected");
    await logAudit({ entityType: ENTITY, entityId: id, action: "rejected", actor: actor.name, summary: note, projectCode: row.project ?? undefined });
    await toUser(row.claimantUserId, row.project ?? undefined, { title: "Claim rejected", body: `${id} was rejected by ${actor.name}: ${note}`, link: claimLink(row.claimantRole) }, actor.id);
    return updated;
  },

  /**
   * Paying creates the one approved expense (vendor = the claimant), books the
   * budget line and the cash-flow month, all in one transaction. A second
   * attempt is a 409 and creates nothing.
   */
  async pay(actor: Actor, id: string, paymentReference: string) {
    const row = await mustFind(id);
    if (!isFinance(actor)) throw new ForbiddenError("Only Finance can pay a claim");
    assertNotSelf(actor.id, row.claimantUserId, "pay");
    assertTransition("reimbursement", id, row.status, "paid");
    if (!row.project || !row.category) throw new ValidationError("This claim has no project or category");
    const project = row.project;
    const category = row.category;
    await assertProjectWritable(project);

    const result = await db.transaction(async (tx) => {
      const paid = await repo.transition(
        id,
        ["approved"],
        { status: "paid", paidAt: new Date(), paidBy: actor.name, paymentReference },
        tx,
      );
      if (!paid) return undefined;
      const expense = await expensesRepository.createApprovedFromSource(tx, {
        vendor: row.employee,
        project,
        category,
        amount: row.amount,
        sourceType: "reimbursement",
        sourceId: id,
        receiptUrl: row.attachments[0]?.url ?? null,
      });
      if (!expense) throw new ConflictError(`An expense already exists for ${id}`);
      const { matched } = await applyApprovedSpend(tx, { project, category, amount: row.amount, at: expense.submittedAt });
      const linked = await repo.transition(id, ["paid"], { expenseId: expense.id }, tx);
      return { claim: linked ?? paid, expense, matched };
    });
    if (!result) return lost(id, "paid");

    const lookalikes = await repo.findLookalikes(row).catch(() => []);
    await annotateSpendExpense(
      result.expense.id,
      lookalikes.length ? [`Possible duplicate claim: ${lookalikes.map((l) => l.id).join(", ")} has the same claimant, amount and date`] : [],
    );

    await logAudit({ entityType: ENTITY, entityId: id, action: "paid", actor: actor.name, summary: `${result.expense.id} · ${paymentReference}`, projectCode: project });
    const msg = { title: "Claim paid", body: `${id} was paid (${paymentReference}).`, link: claimLink(row.claimantRole) };
    await toUser(row.claimantUserId, project, msg, actor.id);
    await toProject(project, ["project-manager"], { ...msg, link: links.approvals });
    return result;
  },

  /** The claimant, while it is still pending. */
  async cancel(actor: Actor, id: string) {
    const row = await mustFind(id);
    if (row.claimantUserId !== actor.id) throw new ForbiddenError("Only the claimant can cancel a claim");
    assertTransition("reimbursement", id, row.status, "cancelled");
    const updated = await repo.transition(id, ["pending-pm", "pending-finance"], { status: "cancelled" });
    if (!updated) return lost(id, "cancelled");
    await logAudit({ entityType: ENTITY, entityId: id, action: "cancelled", actor: actor.name, projectCode: row.project ?? undefined });
    return updated;
  },
};
