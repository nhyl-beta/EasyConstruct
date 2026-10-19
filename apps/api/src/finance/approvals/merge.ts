// apps/api/src/finance/approvals/merge.ts
//
// Pure merge of everything waiting on Finance's sign-off into one list,
// oldest first. No database, so ordering, limit and total are unit-tested.
export type ApprovalKind = "Expense" | "Payroll" | "Budget" | "Purchase request";

export interface PendingItem {
  /** Unique across sources: exp-<id>, pay-<id>, bud-<id>, pr-<id>. */
  id: string;
  kind: ApprovalKind;
  reference: string;
  requestedBy: string;
  amount: number;
  /** When it started waiting on Finance. */
  waitingSince: Date;
  /** Finance page where it is acted on. */
  href: string;
}

export interface ApprovalRow extends Omit<PendingItem, "waitingSince"> {
  waitingHours: number;
  status: "pending";
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export const clampLimit = (raw: unknown): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
};

/** Whole hours, never negative (a clock skew must not show "-1h"). */
export const waitingHours = (since: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - since.getTime()) / 3_600_000));

export function mergePending(
  sources: PendingItem[][],
  now: Date,
  limit: number,
): { items: ApprovalRow[]; total: number } {
  const all = sources
    .flat()
    .sort((a, b) => a.waitingSince.getTime() - b.waitingSince.getTime() || a.id.localeCompare(b.id));
  const items = all.slice(0, limit).map(({ waitingSince, ...rest }) => ({
    ...rest,
    waitingHours: waitingHours(waitingSince, now),
    status: "pending" as const,
  }));
  return { items, total: all.length };
}
