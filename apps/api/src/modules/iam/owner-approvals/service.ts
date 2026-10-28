// A change to the Owner account by anyone else is held here until the Owner approves it from an email link.
// Nothing is applied at request time. On approval the stored action runs on the server (the requester never holds a
// usable approval) through the same service functions as an ordinary change, so session invalidation and the
// last-owner guards still apply.
import { assertMailConfigured, sendMail } from "../../../core/mail/mailer.js";
import { logAudit } from "../../../core/audit/audit.js";
import { env } from "../../../core/config/env.js";
import { AppError, ConflictError, ValidationError } from "../../../core/utils/errors.js";
import { createNotification } from "../../platform/index.js";
import type { OwnerActionRequest } from "../../../core/db/schema/owner-action-requests.js";
import * as usersRepo from "../users/repository.js";
import { getExecutor, type Executor, type ExecutorKey } from "./executors.js";
import * as repoModule from "./repository.js";
import {
  ACTION_LABELS,
  approvalUrl,
  effectiveStatus,
  escapeHtml,
  expiresAtFor,
  isProtectedAction,
  maskEmail,
  overRequestLimit,
  type ProtectedAction,
} from "./rules.js";
import { TOKEN_MESSAGES, TOKEN_PATTERN, evaluateToken, generateToken, hashToken } from "./tokens.js";

export interface Requester {
  id: number;
  name: string;
  role: string;
}

export interface PendingApproval {
  status: "pending_owner_approval";
  requestId: number;
  action: ProtectedAction;
  expiresAt: Date;
  ownerEmailMasked: string;
}

export const isPendingApproval = (value: unknown): value is PendingApproval =>
  typeof value === "object" && value !== null && (value as { status?: unknown }).status === "pending_owner_approval";


/** Everything the service touches outside itself, so the flows can be tested without a database or a mail server. */
export interface Deps {
  repo: typeof repoModule;
  findUser: (id: number) => Promise<{ id: number; name: string; email: string; role: string } | null | undefined>;
  assertMailConfigured: () => void;
  sendMail: typeof sendMail;
  audit: (row: { id: number }, action: string, actor: string, summary: string) => Promise<unknown>;
  notify: (input: Parameters<typeof createNotification>[0]) => Promise<unknown>;
  getExecutor: (key: ExecutorKey) => Executor | undefined;
  ttlMinutes: () => number;
  appUrl: () => string;
}

const liveDeps: Deps = {
  repo: repoModule,
  findUser: (id) => usersRepo.findById(id),
  assertMailConfigured,
  sendMail,
  audit: (row, action, actor, summary) => logAudit({ entityType: "owner-approval", entityId: String(row.id), action, actor, summary }),
  notify: (input) => createNotification(input),
  getExecutor,
  ttlMinutes: () => env.OWNER_APPROVAL_TTL_MINUTES,
  appUrl: () => env.APP_URL,
};

/** What the stored payload may hold. A password reset keeps only the bcrypt hash. */
export interface RequestPayload {
  role?: string;
  fromRole?: string;
  name?: string;
  email?: string;
  from?: { name?: string; email?: string };
  employeeId?: number;
  passwordHash?: string;
  requestedByRole?: string;
}

const payloadOf = (row: OwnerActionRequest): RequestPayload => (row.payload ?? {}) as RequestPayload;

// ── What the Owner is shown ────────────────────────────────────────────────

/** One line per thing that changes. Never includes a password or its hash. */
export const detailLines = (action: ProtectedAction, payload: RequestPayload): string[] => {
  switch (action) {
    case "change_role":
      return [`Role: ${payload.fromRole ?? "owner"} → ${payload.role ?? "?"}`];
    case "change_identity": {
      const lines: string[] = [];
      if (payload.name !== undefined) lines.push(`Name: ${payload.from?.name ?? "?"} → ${payload.name}`);
      if (payload.email !== undefined) lines.push(`Email: ${payload.from?.email ?? "?"} → ${payload.email}`);
      return lines;
    }
    case "password_reset":
      return ["A new password will be set. It is not shown here."];
    default:
      return [];
  }
};

const whenText = (d: Date) => d.toUTCString();

const emailBody = (row: OwnerActionRequest, ownerName: string, token: string, appUrl: string) => {
  const payload = payloadOf(row);
  const action = row.action as ProtectedAction;
  const details = detailLines(action, payload);
  const approve = approvalUrl(appUrl, token);
  const who = `${row.requestedByName}${payload.requestedByRole ? ` (${payload.requestedByRole})` : ""}`;
  const text = [
    `Hello ${ownerName},`,
    "",
    `${who} asked to: ${ACTION_LABELS[action]}.`,
    ...details.map((d) => `  ${d}`),
    "",
    `Requested: ${whenText(row.createdAt)}`,
    `This request expires: ${whenText(row.expiresAt)}`,
    "",
    "Nothing changes until you approve it. Open this link to review it, then choose Approve or Decline:",
    approve,
    "",
    "If you did not expect this, choose Decline (or ignore this email: the request expires on its own).",
  ].join("\n");
  const html =
    `<p>Hello ${escapeHtml(ownerName)},</p>` +
    `<p><strong>${escapeHtml(who)}</strong> asked to: <strong>${escapeHtml(ACTION_LABELS[action])}</strong>.</p>` +
    (details.length ? `<ul>${details.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>` : "") +
    `<p>Requested: ${escapeHtml(whenText(row.createdAt))}<br>This request expires: ${escapeHtml(whenText(row.expiresAt))}</p>` +
    `<p>Nothing changes until you approve it.</p>` +
    `<p><a href="${approve}">Review and decide</a></p>` +
    `<p style="color:#666;font-size:12px">Or paste this link into your browser:<br>${escapeHtml(approve)}</p>` +
    `<p style="color:#666;font-size:12px">If you did not expect this, choose Decline, or ignore this email: the request expires on its own.</p>`;
  return { text, html };
};

// ── Asking ─────────────────────────────────────────────────────────────────

export interface RequestInput {
  /** The Owner account the change is for. */
  targetUserId: number;
  action: ProtectedAction;
  payload?: RequestPayload;
  requester: Requester;
}

/**
 * Hold a change to the Owner account for the Owner's approval. Fails closed: when mail is not configured nothing is
 * created and nothing changes. The Owner's address is read from the database now, never taken from the caller.
 * Callers must already have run the same validations the change itself would run, so the Owner is never asked to
 * approve something that would fail.
 */
export const request = async (input: RequestInput, now: Date = new Date(), deps: Deps = liveDeps): Promise<PendingApproval> => {
  deps.assertMailConfigured();
  if (!isProtectedAction(input.action)) throw new ValidationError("Unknown owner action");

  const owner = await deps.findUser(input.targetUserId);
  if (!owner || owner.role !== "owner") throw new ValidationError("This change does not need the Owner's approval");

  for (const stale of await deps.repo.expireStale(owner.id, now)) {
    await deps.audit(stale, "expired", "system", `Owner approval request #${stale.id} (${stale.action}) expired without an answer`);
  }

  if (overRequestLimit(await deps.repo.recentCreationTimes(input.requester.id, now), now)) {
    throw new AppError(429, "RATE_LIMITED", "Too many Owner approval requests in the last hour. Please wait and try again.");
  }
  if (await deps.repo.findPending(owner.id, input.action)) {
    throw new ConflictError("This change is already waiting for the Owner's approval. Cancel that request first, or wait for the answer.");
  }

  const token = generateToken();
  const payload: RequestPayload = { ...(input.payload ?? {}), requestedByRole: input.requester.role };
  const created = await deps.repo
    .create({
      targetUserId: owner.id,
      action: input.action,
      payload: payload as Record<string, unknown>,
      requestedByUserId: input.requester.id,
      requestedByName: input.requester.name,
      status: "pending",
      tokenHash: hashToken(token),
      expiresAt: expiresAtFor(now, deps.ttlMinutes()),
    })
    .catch((error: { code?: string }) => {
      // The partial unique index: another request for this action was raised a moment ago.
      if (error?.code === "23505") throw new ConflictError("This change is already waiting for the Owner's approval.");
      throw error;
    });
  if (!created) throw new AppError(500, "OWNER_APPROVAL_FAILED", "Could not create the approval request");

  await deps.audit(created, "requested", input.requester.name, `${input.requester.name} (${input.requester.role}) requested: ${ACTION_LABELS[input.action]}`);

  try {
    await deps.sendMail({ to: owner.email, subject: "Approval needed: a change to your EasyConstruct account", ...emailBody(created, owner.name, token, deps.appUrl()) });
  } catch (error) {
    await deps.repo.cancelUnsent(created.id);
    await deps.audit(created, "delivery_failed", "system", `Approval email for request #${created.id} could not be sent; the request was cancelled and nothing changed`);
    throw error;
  }
  await deps.audit(created, "emailed", "system", `Approval email for request #${created.id} sent to the Owner`);

  await deps.notify({
    recipientRole: "owner",
    title: "Account change waiting for your approval",
    body: `${input.requester.name} asked to: ${ACTION_LABELS[input.action]}. Check your email to approve or decline.`,
    link: "/dashboard",
  }).catch((error) => console.error("[owner-approvals] could not notify the Owner", error));

  return {
    status: "pending_owner_approval",
    requestId: created.id,
    action: input.action,
    expiresAt: created.expiresAt,
    ownerEmailMasked: maskEmail(owner.email),
  };
};

// ── The requester's own view ───────────────────────────────────────────────

export interface RequestSummary {
  id: number;
  targetUserId: number;
  action: ProtectedAction;
  actionLabel: string;
  status: string;
  requestedByName: string;
  expiresAt: Date;
  createdAt: Date;
  decidedAt: Date | null;
  executedAt: Date | null;
}

const summarize = (row: OwnerActionRequest, now: Date): RequestSummary => ({
  id: row.id,
  targetUserId: row.targetUserId,
  action: row.action as ProtectedAction,
  actionLabel: ACTION_LABELS[row.action as ProtectedAction] ?? row.action,
  status: effectiveStatus(row, now),
  requestedByName: row.requestedByName,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
  decidedAt: row.decidedAt,
  executedAt: row.executedAt,
});

/** The Owner sees every request; anyone else sees only their own. The token hash and payload are never returned. */
export const listFor = async (viewer: { id: number; role: string }, now: Date = new Date(), deps: Deps = liveDeps): Promise<RequestSummary[]> => {
  const rows = await deps.repo.list(viewer.role === "owner" ? {} : { requestedByUserId: viewer.id });
  return rows.map((r) => summarize(r, now));
};

export const cancel = async (id: number, requester: Requester, deps: Deps = liveDeps): Promise<RequestSummary> => {
  const row = await deps.repo.cancel(id, requester.id);
  if (!row) throw new ConflictError("Only your own pending request can be cancelled");
  await deps.audit(row, "cancelled", requester.name, `${requester.name} cancelled Owner approval request #${row.id}`);
  return summarize(row, new Date());
};

// ── The Owner's side (no login) ────────────────────────────────────────────

const tokenError = (state: "missing" | "expired" | "used") => {
  const m = TOKEN_MESSAGES[state];
  return new AppError(m.status, m.code, m.message);
};

const lookup = async (token: string, deps: Deps) => {
  if (!TOKEN_PATTERN.test(token)) throw tokenError("missing");
  return deps.repo.findByTokenHash(hashToken(token));
};

export interface ApprovalDetails {
  action: ProtectedAction;
  actionLabel: string;
  details: string[];
  requestedByName: string;
  requestedByRole: string | null;
  requestedAt: Date;
  expiresAt: Date;
}

/** Read-only: mail scanners prefetch links, so this never changes anything. */
export const getDetails = async (token: string, now: Date = new Date(), deps: Deps = liveDeps): Promise<ApprovalDetails> => {
  const row = await lookup(token, deps);
  const state = evaluateToken(row, now);
  if (state !== "ok" || !row) throw tokenError(state === "ok" ? "missing" : state);
  const payload = payloadOf(row);
  const action = row.action as ProtectedAction;
  return {
    action,
    actionLabel: ACTION_LABELS[action],
    details: detailLines(action, payload),
    requestedByName: row.requestedByName,
    requestedByRole: payload.requestedByRole ?? null,
    requestedAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
};

const executorKeyFor = (row: OwnerActionRequest): ExecutorKey => {
  const payload = payloadOf(row);
  if (row.action === "change_identity" && payload.employeeId != null) return "employee_identity";
  return row.action as ExecutorKey;
};

export interface DecisionResult {
  decision: "approve" | "decline";
  /** For an approval: false when the Owner approved but the change could not be applied (the reason is audited). */
  applied: boolean;
  message: string;
}

export const decide = async (
  token: string,
  decision: "approve" | "decline",
  ip: string,
  now: Date = new Date(),
  deps: Deps = liveDeps,
): Promise<DecisionResult> => {
  const row = await lookup(token, deps);
  const state = evaluateToken(row, now);
  if (state !== "ok" || !row) {
    if (row && state === "expired") {
      for (const stale of await deps.repo.expireStale(row.targetUserId, now)) {
        await deps.audit(stale, "expired", "system", `Owner approval request #${stale.id} (${stale.action}) expired without an answer`);
      }
    }
    throw tokenError(state === "ok" ? "missing" : state);
  }

  // Exactly one caller wins this claim; a second approval, or a decline racing it, gets the "already answered" message.
  const claimed = await deps.repo.claim(row.id, decision === "approve" ? "approved" : "declined", ip.slice(0, 64), now);
  if (!claimed) throw tokenError("used");

  const owner = await deps.findUser(claimed.targetUserId);
  const ownerName = owner?.name ?? "Owner";
  const label = ACTION_LABELS[claimed.action as ProtectedAction] ?? claimed.action;

  if (decision === "decline") {
    await deps.audit(claimed, "declined", ownerName, `${ownerName} declined Owner approval request #${claimed.id}: ${label}`);
    await notifyRequester(deps, claimed, "Owner declined the account change", `The Owner declined: ${label}. Nothing was changed.`);
    return { decision, applied: false, message: "Declined. Nothing was changed." };
  }

  await deps.audit(claimed, "approved", ownerName, `${ownerName} approved Owner approval request #${claimed.id}: ${label}`);
  const run = deps.getExecutor(executorKeyFor(claimed));
  try {
    if (!run) throw new Error(`No executor registered for ${claimed.action}`);
    await run(claimed);
    await deps.repo.markExecuted(claimed.id, new Date());
    await deps.audit(claimed, "executed", "system", `Owner approval request #${claimed.id} executed: ${label}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await deps.audit(claimed, "execution_failed", "system", `Owner approval request #${claimed.id} was approved but could not be applied: ${reason}`);
    await notifyRequester(deps, claimed, "Approved change could not be applied", `The Owner approved: ${label}, but it could not be applied (${reason}). Raise it again if it is still needed.`);
    return { decision, applied: false, message: `Approved, but the change could not be applied: ${reason}` };
  }

  await notifyRequester(deps, claimed, "Owner approved the account change", `The Owner approved and it was applied: ${label}.`);
  await noticeToOldAddress(deps, claimed);
  return { decision, applied: true, message: "Approved. The change has been applied." };
};

const notifyRequester = async (deps: Deps, row: OwnerActionRequest, title: string, body: string) => {
  if (row.requestedByUserId == null) return;
  await deps.notify({ recipientUserId: row.requestedByUserId, title, body, link: "/users" }).catch((error) =>
    console.error("[owner-approvals] could not notify the requester", error),
  );
};

/** After an approved email change the old address is told, in case it was not the Owner who asked. */
const noticeToOldAddress = async (deps: Deps, row: OwnerActionRequest) => {
  const payload = payloadOf(row);
  if (row.action !== "change_identity" || payload.email === undefined || !payload.from?.email || payload.from.email === payload.email) return;
  try {
    await deps.sendMail({
      to: payload.from.email,
      subject: "Your EasyConstruct account email was changed",
      text: `The email on your EasyConstruct account was changed from ${payload.from.email} to ${payload.email}, with the Owner's approval. If this was not you, contact your administrator right away.`,
      html: `<p>The email on your EasyConstruct account was changed from <strong>${escapeHtml(payload.from.email)}</strong> to <strong>${escapeHtml(payload.email)}</strong>, with the Owner's approval.</p><p>If this was not you, contact your administrator right away.</p>`,
    });
    await deps.audit(row, "old_address_notified", "system", `Notice of the email change for request #${row.id} sent to the old address`);
  } catch (error) {
    console.error("[owner-approvals] could not notify the old address", error instanceof Error ? error.message : error);
  }
};
