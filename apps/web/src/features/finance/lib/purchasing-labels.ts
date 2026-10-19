import type { StatusTone } from "@/config/status-tone";
import type { OrderStatus, PurchaseRequestStatus } from "../types/purchasing.types";

type Label = { label: string; tone: StatusTone };

export const PR_LABELS: Record<PurchaseRequestStatus, Label> = {
  "pending-pm": { label: "Awaiting PM", tone: "warning" },
  "pending-finance": { label: "Awaiting Finance", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  ordered: { label: "Ordered", tone: "info" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const ORDER_LABELS: Record<OrderStatus, Label> = {
  ordered: { label: "Ordered", tone: "info" },
  "in-transit": { label: "In transit", tone: "info" },
  delivered: { label: "Delivered", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** "2026-10-09" or an ISO timestamp becomes "Oct 9, 2026"; an em dash when empty. */
export function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
