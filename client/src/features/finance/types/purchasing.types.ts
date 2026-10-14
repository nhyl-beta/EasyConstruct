// Purchase requests and procurement orders.
// Statuses are strict unions here; the repository normalizes whatever the
// server sends (legacy free-text rows included) into them.

export const PR_STATUSES = ["pending-pm", "pending-finance", "approved", "rejected", "ordered", "cancelled"] as const;
export type PurchaseRequestStatus = (typeof PR_STATUSES)[number];

export const ORDER_STATUSES = ["ordered", "in-transit", "delivered", "paid", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];


export interface LineItem {
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
}

export interface BudgetImpact {
  planned: number;
  committed: number;
  actual: number;
  remaining: number;
  /** remaining after this request's amount is committed */
  remainingAfter: number;
}

export interface PurchaseRequest {
  id: string;
  title: string;
  project: string;
  requestedBy: string;
  requestedByUserId: number | null;
  requestedByRole: string | null;
  amount: number;
  requestedAt: string;
  status: PurchaseRequestStatus;
  category: string;
  requirementId: number | null;
  lineItems: LineItem[];
  neededBy: string | null;
  justification: string | null;
  preferredVendor: string | null;
  endorsedBy: string | null;
  endorsedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  overBudget: boolean;
  committedAmount: number;
  /** Only on the detail response; null when there is no matching budget line. */
  budgetImpact?: BudgetImpact | null;
}

export interface ProcurementOrder {
  id: string;
  purchaseRequestId: string | null;
  vendor: string;
  project: string;
  category: string;
  items: number;
  amount: number;
  lineItems: LineItem[];
  etaDate: string | null;
  status: OrderStatus;
  shippedAt: string | null;
  deliveredAt: string | null;
  receivedBy: string | null;
  deliveryNote: string | null;
  deliveryReceiptUrl: string | null;
  invoiceNumber: string | null;
  invoiceAmount: number | null;
  varianceNote: string | null;
  paidAt: string | null;
  paidBy: string | null;
  expenseId: string | null;
  createdBy: string | null;
  createdByUserId: number | null;
  createdAt: string | null;
}

/** An uploaded receipt or invoice file. */
export interface ReceiptAttachment {
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface CreatePurchaseRequestInput {
  requirementId: number;
  title: string;
  category: string;
  lineItems: LineItem[];
  neededBy?: string;
  justification?: string;
  preferredVendor?: string;
}

export interface CreateOrderInput {
  purchaseRequestId: string;
  vendor: string;
  etaDate?: string;
  lineItems?: LineItem[];
}

export interface PayOrderInput {
  invoiceNumber: string;
  invoiceAmount: number;
  invoiceUrl?: string;
  varianceNote?: string;
}

/** What a mutation tells the caller. `warning` is the over-budget / no-budget-line notice. */
export interface ActionResult<T> {
  ok: boolean;
  data: T | null;
  warning: string | null;
  error: string | null;
}

/** How far a requirement's purchase has got, for the chip on the Requirements pages. */
export type PurchaseProgress =
  | { stage: "none" }
  | { stage: "pending-pm" }
  | { stage: "pending-finance" }
  | { stage: "approved" }
  | { stage: "rejected" }
  | { stage: "ordered"; etaDate: string | null }
  | { stage: "in-transit"; etaDate: string | null }
  | { stage: "delivered" }
  | { stage: "paid" };
