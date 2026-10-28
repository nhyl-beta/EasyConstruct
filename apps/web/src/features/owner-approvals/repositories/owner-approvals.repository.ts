// Owner approvals: a change to the Owner account by someone else waits for the Owner's approval by email.
// The signed-in calls go through apiClient; the Owner's own page (opened from the email, no login) uses plain fetch
// because it is decided by the token in the link and must never send the app's session token.
import { apiClient, apiUrl } from "@/services/api.client";

/** What a held change returns instead of the updated account (HTTP 202). Nothing has changed yet. */
export interface PendingApproval {
  status: "pending_owner_approval";
  requestId: number;
  action: string;
  expiresAt: string;
  ownerEmailMasked: string;
}

export const isPendingApproval = (value: unknown): value is PendingApproval =>
  typeof value === "object" && value !== null && (value as { status?: unknown }).status === "pending_owner_approval";

/** "Approval requested, sent to o***@gmail.com" */
export const pendingApprovalNotice = (p: PendingApproval): string =>
  `Approval requested, sent to ${p.ownerEmailMasked}. Nothing changes until the Owner approves it.`;

export type ApprovalStatus = "pending" | "approved" | "declined" | "expired" | "cancelled";

export interface OwnerApprovalRequest {
  id: number;
  targetUserId: number;
  action: string;
  actionLabel: string;
  status: ApprovalStatus;
  requestedByName: string;
  expiresAt: string;
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
}

export interface ApprovalDetails {
  action: string;
  actionLabel: string;
  details: string[];
  requestedByName: string;
  requestedByRole: string | null;
  requestedAt: string;
  expiresAt: string;
}

export interface ApprovalDecision {
  decision: "approve" | "decline";
  applied: boolean;
  message: string;
}

/** An error the server worded for the Owner. `code` tells the page which kind of message to show. */
export class OwnerApprovalError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "OwnerApprovalError";
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: { data?: T; message?: string; code?: string } = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const fallback = res.status === 429 ? "Too many attempts. Please wait a few minutes and try again." : "Something went wrong. Please try again.";
    throw new OwnerApprovalError(json.message ?? fallback, res.status, json.code);
  }
  return json.data as T;
}

const publicBase = (token: string) => apiUrl(`/public/owner-approvals/${encodeURIComponent(token)}`);

export const ownerApprovalsRepository = {
  /** The Owner sees every request; an IT Designer sees their own. */
  async list(): Promise<OwnerApprovalRequest[]> {
    const json = await apiClient.get("/owner-approvals");
    return (json?.data ?? []) as OwnerApprovalRequest[];
  },

  async cancel(id: number): Promise<void> {
    await apiClient.post(`/owner-approvals/${id}/cancel`, {});
  },

  /** Reads the request behind an emailed link. Changes nothing. */
  async open(token: string): Promise<ApprovalDetails> {
    return parse<ApprovalDetails>(await fetch(publicBase(token), { headers: { Accept: "application/json" } }));
  },

  async decide(token: string, decision: "approve" | "decline"): Promise<ApprovalDecision> {
    return parse<ApprovalDecision>(
      await fetch(`${publicBase(token)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ decision }),
      }),
    );
  },
};
