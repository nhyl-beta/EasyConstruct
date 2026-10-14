// server/src/finance/purchasing/rules.ts
//
// Pure rules for purchase requests and procurement orders (no database): status transition tables, who starts where, the
// segregation-of-duties checks, the budget arithmetic, payment variance and
// the "unsettled" predicate the closeout gate uses. Every state change in the
// services goes through these so each rule is unit-tested once.
import { ConflictError, ForbiddenError, ValidationError } from "../../utils/errors.js";

// ── Statuses ────────────────────────────────────────────────────────────────

export const PR_STATUSES = ["pending-pm", "pending-finance", "approved", "rejected", "ordered", "cancelled"] as const;
export type PrStatus = (typeof PR_STATUSES)[number];

export const ORDER_STATUSES = ["ordered", "in-transit", "delivered", "paid", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type PurchasingKind = "purchase-request" | "procurement-order";

/**
 * Allowed moves. `ordered -> approved` on a request is the order being
 * cancelled (the request is available to order again); a request cannot be
 * cancelled directly once ordered.
 */
export const PR_TRANSITIONS: Record<PrStatus, readonly PrStatus[]> = {
  "pending-pm": ["pending-finance", "rejected", "cancelled"],
  "pending-finance": ["approved", "rejected", "cancelled"],
  approved: ["ordered", "cancelled"],
  ordered: ["approved"],
  rejected: [],
  cancelled: [],
};

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  ordered: ["in-transit", "delivered", "cancelled"],
  "in-transit": ["delivered", "cancelled"],
  delivered: ["paid"],
  paid: [],
  cancelled: [],
};

const TABLES = {
  "purchase-request": PR_TRANSITIONS,
  "procurement-order": ORDER_TRANSITIONS,
} as const;

export const canTransition = (kind: PurchasingKind, from: string, to: string): boolean => {
  const table = TABLES[kind] as Record<string, readonly string[]>;
  return (table[from] ?? []).includes(to);
};

/** 409 when the move is not in the table. The message names both statuses. */
export function assertTransition(kind: PurchasingKind, id: string, from: string, to: string): void {
  if (!canTransition(kind, from, to)) {
    throw new ConflictError(`${id} is ${from}; it cannot move to ${to}`);
  }
}

// ── Where a new request starts ─────────────────────────────────────

/** An Engineer's request is endorsed by the PM first; a PM's (or Admin's) goes straight to Finance. */
export const prStatusAfterRaise = (role: string): "pending-pm" | "pending-finance" =>
  role === "engineer" ? "pending-pm" : "pending-finance";

// ── Segregation of duties ───────────────────────────────────────────────────

/** Nobody decides, endorses or pays their own request. */
export function assertNotSelf(actorId: number, ownerId: number | null | undefined, what: string): void {
  if (ownerId != null && actorId === ownerId) {
    throw new ForbiddenError(`You cannot ${what} your own request`);
  }
}

/** The person who confirms delivery cannot be the one who created that order. */
export function assertReceiverNotCreator(receiverId: number, creatorId: number | null | undefined): void {
  if (creatorId != null && receiverId === creatorId) {
    throw new ForbiddenError("The person who created an order cannot confirm its delivery");
  }
}

// ── Money ───────────────────────────────────────────────────────────────────

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface LineItemInput {
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
}

export const lineTotal = (l: Pick<LineItemInput, "qty" | "unitCost">): number => round2(l.qty * l.unitCost);

/** Amount of a request or order, always computed from its lines. */
export const lineItemsTotal = (lines: readonly Pick<LineItemInput, "qty" | "unitCost">[]): number =>
  round2(lines.reduce((sum, l) => sum + lineTotal(l), 0));

export function assertValidLineItems(lines: readonly LineItemInput[]): void {
  if (lines.length === 0) throw new ValidationError("At least one line item is required");
  for (const l of lines) {
    if (!l.description?.trim()) throw new ValidationError("Every line item needs a description");
    if (!(l.qty > 0)) throw new ValidationError("Line item quantity must be greater than zero");
    if (!(l.unitCost >= 0)) throw new ValidationError("Line item unit cost cannot be negative");
  }
  if (!(lineItemsTotal(lines) > 0)) throw new ValidationError("The total must be greater than zero");
}

// ── Budget ──────────────────────────────────────────────────────────────────

export interface BudgetLine {
  planned: number;
  committed: number;
  actual: number;
}

/** What is still free on a budget line: planned − committed − actual. */
export const budgetRemaining = (b: BudgetLine): number => round2(b.planned - b.committed - b.actual);

export interface BudgetImpact {
  planned: number;
  committed: number;
  actual: number;
  remaining: number;
  /** remaining after this amount is committed */
  remainingAfter: number;
}

/**
 * Budget effect of committing `amount`. `null` when there is no matching
 * budget line: the money is then not counted against anything.
 */
export function budgetImpact(line: BudgetLine | null, amount: number): BudgetImpact | null {
  if (!line) return null;
  const remaining = budgetRemaining(line);
  return {
    planned: line.planned,
    committed: line.committed,
    actual: line.actual,
    remaining,
    remainingAfter: round2(remaining - amount),
  };
}

/** Over budget = no budget line at all, or the amount exceeds what is free. */
export const isOverBudget = (line: BudgetLine | null, amount: number): boolean =>
  line === null || amount > budgetRemaining(line);

/** Finance must write a note to approve something over budget, and to reject anything. */
export function assertDecisionNote(decision: "approve" | "reject", overBudget: boolean, note: string | null | undefined): void {
  const has = !!note?.trim();
  if (decision === "reject" && !has) throw new ValidationError("A note is required to reject");
  if (decision === "approve" && overBudget && !has) {
    throw new ValidationError("This request is over budget (or has no budget line): a decision note is required to approve it");
  }
}

export const OVER_BUDGET_WARNING =
  "Over budget or no matching budget line. Approved with a decision note; the amount is flagged on the request.";

/** `committed` after adding (positive) or releasing (negative) money; never below zero. */
export const committedAfter = (current: number, delta: number): number => Math.max(0, round2(current + delta));

/** Ordering for less than the request releases the difference; more is refused. */
export function orderReduction(requestAmount: number, orderAmount: number): { release: number } {
  if (!(orderAmount > 0)) throw new ValidationError("The order amount must be greater than zero");
  if (orderAmount > requestAmount) {
    throw new ValidationError("An order cannot be for more than its purchase request; raise a new request for the difference");
  }
  return { release: round2(requestAmount - orderAmount) };
}

// ── Payment ─────────────────────────────────────────────────────────────────

export interface PaymentVariance {
  /** invoice − order; positive means the invoice is higher. */
  variance: number;
  differs: boolean;
}

export const paymentVariance = (orderAmount: number, invoiceAmount: number): PaymentVariance => {
  const variance = round2(invoiceAmount - orderAmount);
  return { variance, differs: variance !== 0 };
};

export function assertPayable(order: { id: string; status: string }, invoiceAmount: number, varianceNote: string | null | undefined, orderAmount: number): PaymentVariance {
  if (order.status !== "delivered") {
    throw new ConflictError(`${order.id} is ${order.status}; payment needs a delivered order`);
  }
  if (!(invoiceAmount > 0)) throw new ValidationError("The invoice amount must be greater than zero");
  const v = paymentVariance(orderAmount, invoiceAmount);
  if (v.differs && !varianceNote?.trim()) {
    throw new ValidationError("The invoice differs from the order amount: a variance note is required");
  }
  return v;
}

// ── Unsettled (the Closeout / Turnover gate) ────────────────────────────────

export const isUnsettledRequest = (status: string): boolean =>
  status === "pending-pm" || status === "pending-finance" || status === "approved";

export const isUnsettledOrder = (status: string): boolean => status !== "paid" && status !== "cancelled";

export interface UnsettledInput {
  requests: readonly { id: string; status: string }[];
  orders: readonly { id: string; status: string }[];
}

export function unsettledIds(input: UnsettledInput): string[] {
  return [
    ...input.requests.filter((r) => isUnsettledRequest(r.status)).map((r) => r.id),
    ...input.orders.filter((o) => isUnsettledOrder(o.status)).map((o) => o.id),
  ];
}
