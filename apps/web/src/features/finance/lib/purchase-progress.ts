import type { ProcurementOrder, PurchaseProgress, PurchaseRequest } from "../types/purchasing.types";

/**
 * Where a requirement's purchase stands: the newest request raised for it, and
 * once that is ordered, its order's status. Pure so it can be unit-tested.
 * A cancelled request counts as no purchase; the newest request wins.
 */
export function purchaseProgressFor(
  requirementDbId: number,
  requests: readonly PurchaseRequest[],
  orders: readonly ProcurementOrder[],
): PurchaseProgress {
  const mine = requests
    .filter((r) => r.requirementId === requirementDbId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const latest = mine[0];
  if (!latest) return { stage: "none" };

  switch (latest.status) {
    case "pending-pm":
    case "pending-finance":
    case "approved":
    case "rejected":
      return { stage: latest.status };
    case "cancelled":
      return { stage: "none" };
    case "ordered": {
      // The live order for this request: the newest one that is not cancelled.
      const order = orders
        .filter((o) => o.purchaseRequestId === latest.id && o.status !== "cancelled")
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0];
      if (!order) return { stage: "approved" };
      if (order.status === "ordered") return { stage: "ordered", etaDate: order.etaDate };
      if (order.status === "in-transit") return { stage: "in-transit", etaDate: order.etaDate };
      if (order.status === "delivered") return { stage: "delivered" };
      return { stage: "paid" };
    }
  }
}

export const progressLabel = (p: PurchaseProgress): string => {
  switch (p.stage) {
    case "none":
      return "No purchase";
    case "pending-pm":
      return "PR pending PM";
    case "pending-finance":
      return "PR pending Finance";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "ordered":
      return p.etaDate ? `Ordered · ETA ${p.etaDate}` : "Ordered";
    case "in-transit":
      return "In transit";
    case "delivered":
      return "Delivered";
    case "paid":
      return "Paid";
  }
};
