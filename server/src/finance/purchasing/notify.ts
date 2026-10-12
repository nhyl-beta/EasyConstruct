// Notification helpers for purchasing. A failure to notify must never undo or
// fail the action that caused it, so every call is best-effort.
import * as notifications from "../../notifications/service.js";

type Message = { title: string; body: string; link: string };

const safe = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    console.error("[purchasing] notification failed", e);
  }
};

/** One person, if they are known and are not the person who just acted. */
export const toUser = (userId: number | null | undefined, projectCode: string | undefined, m: Message, exceptUserId?: number) =>
  userId == null || userId === exceptUserId
    ? Promise.resolve()
    : safe(() => notifications.create({ recipientUserId: userId, projectCode, ...m }));

export const toFinance = (projectCode: string | undefined, m: Message) =>
  safe(() => notifications.create({ recipientRole: "finance-manager", projectCode, ...m }));

/** The project's roles: the PM resolves to the real PM, staffed roles to the staffed users. */
export const toProject = (projectCode: string, roles: string[], m: Message) =>
  safe(() => notifications.notifyProject(projectCode, roles, m));

/** A row changed under the caller's feet: 409 naming the status it is in now. */
export const links = {
  finance: (tab: "purchase-requests" | "procurement" | "reimbursements") => `/expenses?tab=${tab}`,
  approvals: "/approvals",
  requirements: "/requirements",
  claims: "/my-claims",
} as const;

/**
 * Where a claimant is sent from a claim notification. Only Engineers and Site Personnel can open
 * /my-claims; a claim filed earlier by another role still notifies them, but to a page they can open.
 */
export const claimLink = (claimantRole: string | null | undefined): string =>
  claimantRole === "engineer" || claimantRole === "site-personnel" ? links.claims : "/dashboard";
