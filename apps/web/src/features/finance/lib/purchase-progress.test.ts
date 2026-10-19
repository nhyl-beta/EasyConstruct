import { describe, expect, it } from "vitest";

import { progressLabel, purchaseProgressFor } from "./purchase-progress";
import type { ProcurementOrder, PurchaseRequest } from "../types/purchasing.types";

const pr = (o: Partial<PurchaseRequest>): PurchaseRequest => ({
  id: "PR-0001", title: "t", project: "P", requestedBy: "x", requestedByUserId: 1, requestedByRole: "engineer", amount: 10,
  requestedAt: "2026-10-01T00:00:00Z", status: "pending-pm", category: "Materials", requirementId: 7, lineItems: [], neededBy: null,
  justification: null, preferredVendor: null, endorsedBy: null, endorsedAt: null, decidedBy: null, decidedAt: null,
  decisionNote: null, overBudget: false, committedAmount: 0, ...o,
});
const order = (o: Partial<ProcurementOrder>): ProcurementOrder => ({
  id: "PO-0001", purchaseRequestId: "PR-0001", vendor: "v", project: "P", category: "Materials", items: 1, amount: 10, lineItems: [],
  etaDate: "2026-10-20", status: "ordered", shippedAt: null, deliveredAt: null, receivedBy: null, deliveryNote: null,
  deliveryReceiptUrl: null, invoiceNumber: null, invoiceAmount: null, varianceNote: null, paidAt: null, paidBy: null,
  expenseId: null, createdBy: null, createdByUserId: null, createdAt: "2026-10-02T00:00:00Z", ...o,
});

describe("purchaseProgressFor", () => {
  it("is none without a request", () => {
    expect(purchaseProgressFor(7, [], [])).toEqual({ stage: "none" });
    expect(purchaseProgressFor(7, [pr({ requirementId: 8 })], [])).toEqual({ stage: "none" });
  });

  it("follows the request through approval", () => {
    for (const status of ["pending-pm", "pending-finance", "approved", "rejected"] as const) {
      expect(purchaseProgressFor(7, [pr({ status })], [])).toEqual({ stage: status });
    }
  });

  it("a cancelled request counts as no purchase", () => {
    expect(purchaseProgressFor(7, [pr({ status: "cancelled" })], [])).toEqual({ stage: "none" });
  });

  it("follows the order once ordered", () => {
    const ordered = pr({ status: "ordered" });
    expect(purchaseProgressFor(7, [ordered], [order({})])).toEqual({ stage: "ordered", etaDate: "2026-10-20" });
    expect(purchaseProgressFor(7, [ordered], [order({ status: "in-transit" })])).toEqual({ stage: "in-transit", etaDate: "2026-10-20" });
    expect(purchaseProgressFor(7, [ordered], [order({ status: "delivered" })])).toEqual({ stage: "delivered" });
    expect(purchaseProgressFor(7, [ordered], [order({ status: "paid" })])).toEqual({ stage: "paid" });
  });

  it("a cancelled order sends the chip back to approved", () => {
    expect(purchaseProgressFor(7, [pr({ status: "ordered" })], [order({ status: "cancelled" })])).toEqual({ stage: "approved" });
  });

  it("the newest request wins", () => {
    const older = pr({ id: "PR-0001", status: "rejected", requestedAt: "2026-09-01T00:00:00Z" });
    const newer = pr({ id: "PR-0002", status: "pending-finance", requestedAt: "2026-10-01T00:00:00Z" });
    expect(purchaseProgressFor(7, [older, newer], [])).toEqual({ stage: "pending-finance" });
  });

  it("labels", () => {
    expect(progressLabel({ stage: "ordered", etaDate: "2026-10-20" })).toBe("Ordered · ETA 2026-10-20");
    expect(progressLabel({ stage: "pending-pm" })).toBe("PR pending PM");
    expect(progressLabel({ stage: "none" })).toBe("No purchase");
  });
});
