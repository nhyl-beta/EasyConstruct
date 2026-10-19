import { db } from "../../db/connection.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors.js";
import { logAudit } from "../../utils/audit.js";
import { assertProjectWritable } from "../../lifecycle/service.js";
import { assertCanSee, isFinance, isProjectPm, loadProject, staffing, visibleCodes, type Actor } from "../purchasing/access.js";
import { adjustCommitted, applyApprovedSpend } from "../purchasing/booking.js";
import { nextId } from "../purchasing/ids.js";
import { links, toFinance, toProject, toUser } from "../purchasing/notify.js";
import {
  assertPayable,
  assertReceiverNotCreator,
  assertTransition,
  assertValidLineItems,
  lineItemsTotal,
  orderReduction,
} from "../purchasing/rules.js";
import { purchaseRequestsRepository as prRepo } from "../purchase-requests/repository.js";
import { expensesRepository } from "../expenses/repository.js";
import { annotateSpendExpense } from "../expenses/services.js";
import { procurementRepository as repo, type ProcurementOrderRow } from "./repository.js";
import type { PurchaseLineItem } from "../../db/schema/finance.js";

const ENTITY = "procurement-order";
const finLink = links.finance("procurement");

async function mustFind(id: string): Promise<ProcurementOrderRow> {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError("Procurement order", id);
  return row;
}

async function lost(id: string, wanted: string): Promise<never> {
  const current = await mustFind(id);
  throw new ConflictError(`${id} is ${current.status}; it can no longer be ${wanted}`);
}

const requireFinance = (actor: Actor) => {
  if (!isFinance(actor)) throw new ForbiddenError("Only Finance can do this");
};

export const procurementService = {
  /** Finance turns an approved request into an order. One order per request; never for more than the request. */
  async create(
    actor: Actor,
    input: { purchaseRequestId: string; vendor: string; etaDate?: string; lineItems?: PurchaseLineItem[] },
  ) {
    requireFinance(actor);
    const pr = await prRepo.findById(input.purchaseRequestId);
    if (!pr) throw new NotFoundError("Purchase request", input.purchaseRequestId);
    assertTransition("purchase-request", pr.id, pr.status, "ordered");
    await assertProjectWritable(pr.project);
    if (!pr.category) throw new ValidationError("The request has no category");

    const lines = input.lineItems ?? pr.lineItems;
    assertValidLineItems(lines);
    const amount = lineItemsTotal(lines);
    const { release } = orderReduction(pr.amount, amount);
    const id = await nextId("PO", db);

    const order = await db.transaction(async (tx) => {
      // The request keeps only what the order needs; the difference goes back to the budget.
      const moved = await prRepo.transition(pr.id, ["approved"], { status: "ordered", committedAmount: amount }, tx);
      if (!moved) return undefined;
      if (release > 0) await adjustCommitted(tx, pr.project, pr.category!, -release);
      return repo.insert(
        {
          id,
          vendor: input.vendor,
          project: pr.project,
          items: lines.length,
          amount,
          eta: input.etaDate ?? null,
          etaDate: input.etaDate ?? null,
          status: "ordered",
          purchaseRequestId: pr.id,
          category: pr.category,
          lineItems: lines,
          createdBy: actor.name,
          createdByUserId: actor.id,
        },
        tx,
      );
    });
    if (!order) throw new ConflictError(`${pr.id} is no longer approved; it cannot be ordered`);

    await logAudit({ entityType: ENTITY, entityId: id, action: "created", actor: actor.name, summary: `${pr.id} · ${input.vendor} · ${amount.toFixed(2)}`, projectCode: pr.project });
    const msg = {
      title: "Order placed: expect a delivery",
      body: `${id} (${pr.title}) was ordered from ${input.vendor}${input.etaDate ? `, ETA ${input.etaDate}` : ""}.`,
      link: links.requirements,
    };
    await toUser(pr.requestedByUserId, pr.project, msg, actor.id);
    await toProject(pr.project, ["engineer", "site-personnel"], msg);
    return order;
  },

  async list(actor: Actor, status?: string) {
    const [rows, codes] = await Promise.all([repo.findAll(), visibleCodes(actor)]);
    return rows.filter((o) => (!status || o.status === status) && (codes === null || codes.has(o.project)));
  },

  async detail(actor: Actor, id: string) {
    const order = await mustFind(id);
    await assertCanSee(actor, order.project);
    const pr = order.purchaseRequestId ? await prRepo.findById(order.purchaseRequestId) : null;
    return {
      ...order,
      purchaseRequest: pr ? { id: pr.id, title: pr.title, requestedBy: pr.requestedBy, amount: pr.amount } : null,
    };
  },

  async ship(actor: Actor, id: string, etaDate?: string) {
    requireFinance(actor);
    const order = await mustFind(id);
    assertTransition("procurement-order", id, order.status, "in-transit");
    await assertProjectWritable(order.project);
    const updated = await repo.transition(id, ["ordered"], {
      status: "in-transit",
      shippedAt: new Date(),
      ...(etaDate ? { etaDate, eta: etaDate } : {}),
    });
    if (!updated) return lost(id, "marked in transit");
    await logAudit({ entityType: ENTITY, entityId: id, action: "in-transit", actor: actor.name, projectCode: order.project });
    return updated;
  },

  /**
   * Receiving is a site job: a staffed Engineer or Site Personnel, that
   * project's PM, or Admin. Never the person who created the order.
   */
  async deliver(actor: Actor, id: string, input: { note?: string; receiptUrl?: string }) {
    const order = await mustFind(id);
    const project = await loadProject(order.project);
    const allowed =
      actor.role === "admin" ||
      isProjectPm(project, actor) ||
      ((actor.role === "engineer" || actor.role === "site-personnel") && !!(await staffing(actor, order.project, [actor.role])));
    if (!allowed) throw new ForbiddenError("Only people on this project can confirm a delivery");
    assertReceiverNotCreator(actor.id, order.createdByUserId);
    assertTransition("procurement-order", id, order.status, "delivered");
    await assertProjectWritable(order.project);

    const updated = await repo.transition(id, ["ordered", "in-transit"], {
      status: "delivered",
      deliveredAt: new Date(),
      receivedByUserId: actor.id,
      receivedBy: actor.name,
      deliveryNote: input.note ?? null,
      deliveryReceiptUrl: input.receiptUrl ?? null,
    });
    if (!updated) return lost(id, "marked delivered");
    await logAudit({ entityType: ENTITY, entityId: id, action: "delivered", actor: actor.name, projectCode: order.project });
    await toFinance(order.project, {
      title: "Delivery confirmed",
      body: `${id} (${order.vendor}) was received by ${actor.name}. Ready for payment.`,
      link: finLink,
    });
    return updated;
  },

  /**
   * Payment is the moment money moves. ONE transaction: the order becomes
   * `paid`, one approved expense is created (unique on its source), the budget
   * line's `actual` grows by the invoice amount, the order's commitment is
   * released, and the month's cash flow is recomputed. A second attempt finds
   * the order no longer `delivered` and is a 409 that changes nothing.
   */
  async pay(
    actor: Actor,
    id: string,
    input: { invoiceNumber: string; invoiceAmount: number; invoiceUrl?: string; varianceNote?: string },
  ) {
    requireFinance(actor);
    const order = await mustFind(id);
    if (!order.category) throw new ValidationError("The order has no category");
    const category = order.category;
    const variance = assertPayable(order, input.invoiceAmount, input.varianceNote, order.amount);
    await assertProjectWritable(order.project);

    const result = await db.transaction(async (tx) => {
      const paid = await repo.transition(
        id,
        ["delivered"],
        {
          status: "paid",
          paidAt: new Date(),
          paidBy: actor.name,
          invoiceNumber: input.invoiceNumber,
          invoiceAmount: input.invoiceAmount,
          varianceNote: input.varianceNote?.trim() || null,
        },
        tx,
      );
      if (!paid) return undefined;

      const expense = await expensesRepository.createApprovedFromSource(tx, {
        vendor: order.vendor,
        project: order.project,
        category,
        amount: input.invoiceAmount,
        sourceType: "purchase-order",
        sourceId: id,
        receiptUrl: input.invoiceUrl ?? null,
      });
      if (!expense) throw new ConflictError(`An expense already exists for ${id}`);

      const { matched } = await applyApprovedSpend(tx, {
        project: order.project,
        category,
        amount: input.invoiceAmount,
        at: expense.submittedAt,
      });

      // Release what the request still holds on the budget line.
      const pr = order.purchaseRequestId ? await prRepo.findById(order.purchaseRequestId, tx) : null;
      if (pr && pr.committedAmount > 0) {
        await adjustCommitted(tx, order.project, category, -pr.committedAmount);
        await prRepo.transition(pr.id, ["ordered"], { committedAmount: 0 }, tx);
      }
      const linked = await repo.transition(id, ["paid"], { expenseId: expense.id }, tx);
      return { order: linked ?? paid, expense, matched };
    });
    if (!result) return lost(id, "paid");

    // After the commit: decision support only, never undoes the payment.
    await annotateSpendExpense(
      result.expense.id,
      variance.differs ? [`Invoice differs from order ${id} by ${variance.variance.toFixed(2)}`] : [],
    );

    await logAudit({ entityType: ENTITY, entityId: id, action: "paid", actor: actor.name, summary: `${result.expense.id} · ${input.invoiceAmount.toFixed(2)}`, projectCode: order.project });
    const pr = order.purchaseRequestId ? await prRepo.findById(order.purchaseRequestId) : null;
    const msg = { title: "Purchase paid", body: `${id} (${order.vendor}) was paid: ${result.expense.id}.`, link: links.requirements };
    await toUser(pr?.requestedByUserId, order.project, msg, actor.id);
    await toProject(order.project, ["project-manager"], { ...msg, link: links.approvals });
    return result;
  },

  /** Before delivery. The request goes back to approved and holds its full amount again. */
  async cancel(actor: Actor, id: string) {
    requireFinance(actor);
    const order = await mustFind(id);
    assertTransition("procurement-order", id, order.status, "cancelled");
    await assertProjectWritable(order.project);

    const updated = await db.transaction(async (tx) => {
      const o = await repo.transition(id, ["ordered", "in-transit"], { status: "cancelled" }, tx);
      if (!o) return undefined;
      const pr = o.purchaseRequestId ? await prRepo.findById(o.purchaseRequestId, tx) : null;
      if (pr) {
        const back = await prRepo.transition(pr.id, ["ordered"], { status: "approved", committedAmount: pr.amount }, tx);
        if (back && o.category && pr.amount > pr.committedAmount) {
          await adjustCommitted(tx, o.project, o.category, pr.amount - pr.committedAmount);
        }
      }
      return o;
    });
    if (!updated) return lost(id, "cancelled");
    await logAudit({ entityType: ENTITY, entityId: id, action: "cancelled", actor: actor.name, projectCode: order.project });
    return updated;
  },
};
