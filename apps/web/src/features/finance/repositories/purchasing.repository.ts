import { apiClient } from "@/services/api.client";
import {
  ORDER_STATUSES,
  PR_STATUSES,
  type ActionResult,
  type BudgetImpact,
  type CreateOrderInput,
  type CreatePurchaseRequestInput,
  type LineItem,
  type OrderStatus,
  type PayOrderInput,
  type ProcurementOrder,
  type PurchaseRequest,
  type PurchaseRequestStatus,
} from "../types/purchasing.types";

type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : num(v));
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** An unknown status (a legacy free-text row) becomes a terminal one, so no action is offered on it. */
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.find((s) => s === v) ?? fallback;

const lineItem = (v: unknown): LineItem => {
  const o = obj(v);
  return { description: str(o.description), qty: num(o.qty), unit: str(o.unit), unitCost: num(o.unitCost) };
};

const budgetImpact = (v: unknown): BudgetImpact | null => {
  if (!v || typeof v !== "object") return null;
  const o = obj(v);
  return {
    planned: num(o.planned),
    committed: num(o.committed),
    actual: num(o.actual),
    remaining: num(o.remaining),
    remainingAfter: num(o.remainingAfter),
  };
};

export const normalizePurchaseRequest = (v: unknown): PurchaseRequest => {
  const o = obj(v);
  return {
    id: str(o.id),
    title: str(o.title),
    project: str(o.project),
    requestedBy: str(o.requestedBy),
    requestedByUserId: numOrNull(o.requestedByUserId),
    requestedByRole: strOrNull(o.requestedByRole),
    amount: num(o.amount),
    requestedAt: str(o.requestedAt),
    status: oneOf<PurchaseRequestStatus>(PR_STATUSES, o.status, "cancelled"),
    category: str(o.category),
    requirementId: numOrNull(o.requirementId),
    lineItems: arr(o.lineItems).map(lineItem),
    neededBy: strOrNull(o.neededBy),
    justification: strOrNull(o.justification),
    preferredVendor: strOrNull(o.preferredVendor),
    endorsedBy: strOrNull(o.endorsedBy),
    endorsedAt: strOrNull(o.endorsedAt),
    decidedBy: strOrNull(o.decidedBy),
    decidedAt: strOrNull(o.decidedAt),
    decisionNote: strOrNull(o.decisionNote),
    overBudget: o.overBudget === true,
    committedAmount: num(o.committedAmount),
    ...("budgetImpact" in o ? { budgetImpact: budgetImpact(o.budgetImpact) } : {}),
  };
};

export const normalizeOrder = (v: unknown): ProcurementOrder => {
  const o = obj(v);
  return {
    id: str(o.id),
    purchaseRequestId: strOrNull(o.purchaseRequestId),
    vendor: str(o.vendor),
    project: str(o.project),
    category: str(o.category),
    items: num(o.items),
    amount: num(o.amount),
    lineItems: arr(o.lineItems).map(lineItem),
    etaDate: strOrNull(o.etaDate),
    status: oneOf<OrderStatus>(ORDER_STATUSES, o.status, "cancelled"),
    shippedAt: strOrNull(o.shippedAt),
    deliveredAt: strOrNull(o.deliveredAt),
    receivedBy: strOrNull(o.receivedBy),
    deliveryNote: strOrNull(o.deliveryNote),
    deliveryReceiptUrl: strOrNull(o.deliveryReceiptUrl),
    invoiceNumber: strOrNull(o.invoiceNumber),
    invoiceAmount: numOrNull(o.invoiceAmount),
    varianceNote: strOrNull(o.varianceNote),
    paidAt: strOrNull(o.paidAt),
    paidBy: strOrNull(o.paidBy),
    expenseId: strOrNull(o.expenseId),
    createdBy: strOrNull(o.createdBy),
    createdByUserId: numOrNull(o.createdByUserId),
    createdAt: strOrNull(o.createdAt),
  };
};

/** `{ success, message, data }` -> data */
const data = (json: unknown): unknown => obj(json).data;

/** Runs a mutation and turns a thrown error into a result (a 409 means the list on screen is stale). */
async function act<T>(call: () => Promise<unknown>, map: (d: unknown) => T): Promise<ActionResult<T>> {
  try {
    const json = await call();
    const d = data(json);
    const warning = strOrNull(obj(d).warning);
    return { ok: true, data: map(d), warning, error: null };
  } catch (err) {
    return { ok: false, data: null, warning: null, error: err instanceof Error ? err.message : "Something went wrong" };
  }
}

const enc = encodeURIComponent;
const withQuery = (path: string, status?: string) => (status ? `${path}?status=${enc(status)}` : path);

export const PurchaseRequestRepository = {
  async list(status?: string): Promise<PurchaseRequest[]> {
    return arr(data(await apiClient.get(withQuery("/finance/purchase-requests", status)))).map(normalizePurchaseRequest);
  },
  async get(id: string): Promise<PurchaseRequest> {
    return normalizePurchaseRequest(data(await apiClient.get(`/finance/purchase-requests/${enc(id)}`)));
  },
  create: (input: CreatePurchaseRequestInput) =>
    act(() => apiClient.post("/finance/purchase-requests", input), normalizePurchaseRequest),
  endorse: (id: string) => act(() => apiClient.post(`/finance/purchase-requests/${enc(id)}/endorse`, {}), normalizePurchaseRequest),
  approve: (id: string, note?: string) =>
    act(() => apiClient.post(`/finance/purchase-requests/${enc(id)}/approve`, { note }), normalizePurchaseRequest),
  reject: (id: string, note: string) =>
    act(() => apiClient.post(`/finance/purchase-requests/${enc(id)}/reject`, { note }), normalizePurchaseRequest),
  cancel: (id: string) => act(() => apiClient.post(`/finance/purchase-requests/${enc(id)}/cancel`, {}), normalizePurchaseRequest),
};

export const ProcurementRepository = {
  async list(status?: string): Promise<ProcurementOrder[]> {
    return arr(data(await apiClient.get(withQuery("/finance/procurement", status)))).map(normalizeOrder);
  },
  create: (input: CreateOrderInput) => act(() => apiClient.post("/finance/procurement", input), normalizeOrder),
  ship: (id: string, etaDate?: string) => act(() => apiClient.post(`/finance/procurement/${enc(id)}/ship`, { etaDate }), normalizeOrder),
  deliver: (id: string, input: { note?: string; receiptUrl?: string }) =>
    act(() => apiClient.post(`/finance/procurement/${enc(id)}/deliver`, input), normalizeOrder),
  pay: (id: string, input: PayOrderInput) =>
    act(() => apiClient.post(`/finance/procurement/${enc(id)}/pay`, input), (d) => normalizeOrder(obj(d).order)),
  cancel: (id: string) => act(() => apiClient.post(`/finance/procurement/${enc(id)}/cancel`, {}), normalizeOrder),
};
