// apps/api/src/modules/iam/owner-approvals/rules.ts: pure, no database
//
// Which changes to the Owner account are held for the Owner's approval, and the limits on asking.

export const PROTECTED_ACTIONS = [
  "deactivate",
  "reactivate",
  "password_reset",
  "change_role",
  "change_identity",
  "delete",
] as const;
export type ProtectedAction = (typeof PROTECTED_ACTIONS)[number];

export const STATUSES = ["pending", "approved", "declined", "expired", "cancelled"] as const;
export type RequestStatus = (typeof STATUSES)[number];

export const MAX_REQUESTS_PER_HOUR = 3;
export const REQUEST_WINDOW_MS = 60 * 60_000;

export const ACTION_LABELS: Record<ProtectedAction, string> = {
  deactivate: "Deactivate the Owner account",
  reactivate: "Reactivate the Owner account",
  password_reset: "Reset the Owner account password",
  change_role: "Change the role of the Owner account",
  change_identity: "Change the name or email of the Owner account",
  delete: "Permanently delete the Owner account",
};

export const isProtectedAction = (value: unknown): value is ProtectedAction =>
  typeof value === "string" && (PROTECTED_ACTIONS as readonly string[]).includes(value);

/**
 * A change is held when the target is the Owner account and the person making it is not the Owner on themselves
 * (the Owner reaches their own account through the normal sign-in and reset flows).
 */
export const needsOwnerApproval = (target: { id: number; role: string }, actor: { id: number } | undefined): boolean =>
  target.role === "owner" && actor?.id !== target.id;

export const expiresAtFor = (now: Date, ttlMinutes: number): Date => new Date(now.getTime() + ttlMinutes * 60_000);

/** True when `recent` (creation times of the requester's requests) already holds the hourly maximum. */
export const overRequestLimit = (recent: Date[], now: Date, max = MAX_REQUESTS_PER_HOUR): boolean =>
  recent.filter((t) => now.getTime() - t.getTime() < REQUEST_WINDOW_MS).length >= max;

/** o***@gmail.com: enough for the requester to recognise the mailbox, not enough to learn the address. */
export const maskEmail = (email: string): string => {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email[0]}***${email.slice(at)}`;
};

/** A request still waiting but past its time reads as expired. */
export const effectiveStatus = (row: { status: string; expiresAt: Date }, now: Date = new Date()): RequestStatus => {
  const status = (STATUSES as readonly string[]).includes(row.status) ? (row.status as RequestStatus) : "cancelled";
  return status === "pending" && now.getTime() >= row.expiresAt.getTime() ? "expired" : status;
};

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const approvalUrl = (appUrl: string, token: string): string => `${appUrl.replace(/\/+$/, "")}/owner-approval/${token}`;
