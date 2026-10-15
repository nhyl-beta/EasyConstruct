// server/src/design-requests/service.ts
//
// RFI / RFA workflow. The PM or an Engineer raises a request; the Architect or
// Consultant staffed on the project answers it. An Engineer's request is a
// draft until the PM sends it (the countersign). Open requests block closing a
// project (lifecycle gate X5).
import { SIGNAL_THRESHOLDS } from "../config/signals.js";
import type { DesignRequest } from "../db/schema/design-requests.js";
import { assertProjectWritable } from "../lifecycle/service.js";
import * as notifications from "../notifications/service.js";
import * as projectMemberRepo from "../project-members/repository.js";
import * as projectsRepo from "../projects/repository.js";
import * as usersRepo from "../users/repository.js";
import { assertProjectVisible, scopeRowsToVisible } from "../projects/service.js";
import type {
  CreateDesignRequestInput,
  RespondDesignRequestInput,
  UpdateDesignRequestInput,
} from "../validators/design-request-validators.js";
import { logAudit } from "../utils/audit.js";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/errors.js";
import * as repo from "./repository.js";
import { sendClientEmail } from "./client-email.js";
import {
  canRaise,
  CLIENT_ACTIVE_STATUSES,
  computeDueDate,
  impliesChangeOrder,
  isEligibleAssigneeRole,
  isOpenRequest,
  isOverdue,
  MAX_EMAIL_RESENDS,
  needsCountersign,
  RESPONDER_ROLES,
  statusAfterResponse,
  STATUS_LABEL,
  type RequestKind,
  type RequestStatus,
} from "./rules.js";

export interface Actor {
  id: number;
  name: string;
  role: string;
}

const visibility = (a: Actor) => ({ id: a.id, role: a.role, name: a.name });

/** The row plus the derived fields the UI needs; "overdue" is computed here, never stored. */
export const toView = (r: DesignRequest, now: Date = new Date()) => ({
  ...r,
  statusLabel: STATUS_LABEL[r.status as RequestStatus] ?? r.status,
  isOpen: isOpenRequest(r.status),
  isOverdue: isOverdue({ status: r.status, dueDate: r.dueDate }, now),
  suggestsChangeOrder: impliesChangeOrder(r),
});
export type DesignRequestView = ReturnType<typeof toView>;

const requireRequest = async (id: number) => {
  const row = await repo.findById(id);
  if (!row) throw new NotFoundError("Request", String(id));
  return row;
};

const assertEligibleAssignee = async (projectCode: string, userId: number) => {
  const memberships = await projectMemberRepo.findAll({ projectCode, userId });
  const m = memberships.find((x) => isEligibleAssigneeRole(x.role));
  if (!m) throw new ValidationError("The request must be assigned to an Architect or Consultant staffed on this project");
  return m;
};

/** People a request on this project can be assigned to. */
export const getAssignees = async (projectCode: string, actor: Actor) => {
  await assertProjectVisible(visibility(actor), projectCode, "requests");
  const members = await projectMemberRepo.findAll({ projectCode });
  return members
    .filter((m) => isEligibleAssigneeRole(m.role))
    .map((m) => ({ userId: m.userId, name: m.userName, role: m.role }));
};

const isPmOrAdmin = (a: Actor) => a.role === "project-manager" || a.role === "admin";

const isClientRequest = (r: Pick<DesignRequest, "recipientType">) => r.recipientType === "client";
/** Architects / Consultants work internal requests only; client requests are not theirs to see. */
const isResponderRole = (role: string) => (RESPONDER_ROLES as readonly string[]).includes(role);
/** The raiser, the PM and the Admin handle a client request (there is no assignee). */
const canHandleClientRequest = (r: DesignRequest, a: Actor) => a.role === "admin" || a.role === "project-manager" || r.requestedByUserId === a.id;

/**
 * Emails a client request and records the outcome. Never throws: a failed send
 * (including the mailer's 503 when SMTP is not configured) leaves the request
 * saved with email_status = 'failed' so it can be resent. Cc / Reply-To come
 * from the signed-in user's own record, never from the request body.
 */
const dispatchClientEmail = async (row: DesignRequest, actor: Actor): Promise<DesignRequest> => {
  let ok = false;
  try {
    const [sender, project, files] = await Promise.all([
      usersRepo.findById(actor.id),
      projectsRepo.findByCode(row.projectCode),
      repo.findFiles([row.id]),
    ]);
    if (!sender?.email) throw new Error("the sending user has no email address");
    await sendClientEmail({
      request: row,
      projectName: project?.name ?? row.projectCode,
      senderName: sender.name || actor.name,
      senderEmail: sender.email,
      files: files.filter((f) => f.stage === "request"),
    });
    ok = true;
  } catch (err) {
    console.warn(`[design-requests] client email for ${row.number} failed:`, err instanceof Error ? err.message : err);
  }
  const updated = await repo.update(row.id, { emailStatus: ok ? "sent" : "failed", ...(ok && !row.sentAt ? { sentAt: new Date() } : {}) });
  return updated ?? row;
};

const fileRows = (files: { url: string; filename: string; contentType: string; sizeBytes: number }[] | undefined, stage: "request" | "response", by: string) =>
  (files ?? []).map((f) => ({ ...f, stage, uploadedByName: by }));

const link = (r: { id: number }) => `/requests?open=${r.id}`;

const notifyAssignee = (r: DesignRequest, title: string, body: string) =>
  r.assignedToUserId
    ? notifications.create({ recipientUserId: r.assignedToUserId, projectCode: r.projectCode, title, body, link: link(r) })
    : Promise.resolve();

// ── Reads ──────────────────────────────────────────────────────────────────

export interface ListQuery {
  projectCode?: string;
  kind?: string;
  status?: string;
  search?: string;
  /** "raised": by me; "inbox": assigned to me */
  box?: "raised" | "inbox";
  overdue?: boolean;
}

export const list = async (q: ListQuery, actor: Actor) => {
  const rows = await repo.findAll({
    projectCode: q.projectCode,
    kind: q.kind,
    status: q.status,
    search: q.search,
    requestedByUserId: q.box === "raised" ? actor.id : undefined,
    assignedToUserId: q.box === "inbox" ? actor.id : undefined,
  });
  const scoped = await scopeRowsToVisible(visibility(actor), rows, (r) => r.projectCode);
  const visible = isResponderRole(actor.role) ? scoped.filter((r) => !isClientRequest(r)) : scoped;
  // Cheap, claim-guarded check so the "no client response" reminder fires without a cron.
  void sweepClientReplies(new Date(), actor.id).catch((err) => console.error("[design-requests] client reminder check failed", err));
  const now = new Date();
  const views = visible.map((r) => toView(r, now));
  return q.overdue ? views.filter((v) => v.isOverdue) : views;
};

export const getById = async (id: number, actor: Actor) => {
  const row = await requireRequest(id);
  await assertProjectVisible(visibility(actor), row.projectCode, "requests");
  if (isClientRequest(row) && isResponderRole(actor.role)) throw new NotFoundError("Request", String(id));
  const [files, followUps] = await Promise.all([repo.findFiles([id]), repo.findFollowUps(id)]);
  const origin = row.followUpOfId ? await repo.findById(row.followUpOfId) : null;
  return {
    ...toView(row),
    files,
    followUps: followUps.map((f) => toView(f)),
    followUpOf: origin ? { id: origin.id, number: origin.number } : null,
  };
};

// ── Writes ─────────────────────────────────────────────────────────────────

export const create = async (input: CreateDesignRequestInput, actor: Actor) => {
  if (!canRaise(actor.role)) throw new ForbiddenError("Only the Project Manager or an Engineer can raise an RFI or RFA");
  await assertProjectVisible(visibility(actor), input.projectCode, "requests");
  const project = await projectsRepo.findByCode(input.projectCode);
  if (!project) throw new NotFoundError("Project", input.projectCode);
  await assertProjectWritable(project.code);
  const isClient = input.recipientType === "client";
  const assignee = isClient ? null : await assertEligibleAssignee(project.code, input.assignedToUserId!);

  if (input.followUpOfId) {
    const origin = await requireRequest(input.followUpOfId);
    if (origin.projectCode !== project.code) throw new ValidationError("A follow-up must stay on the same project");
    if (origin.status === "closed" || origin.status === "draft") throw new ConflictError("Only an open or answered request can be followed up");
  }

  const now = new Date();
  const sendNow = !needsCountersign(actor.role); // PM / Admin: auto-countersigned and sent
  let created = await repo.insertNumbered(
    { kind: input.kind as RequestKind, projectCode: project.code, discipline: input.discipline, now },
    {
      sheetNumbers: input.sheetNumbers,
      subject: input.subject,
      sectionsReferenced: input.sectionsReferenced,
      requestText: input.requestText,
      costImpact: input.costImpact,
      costNote: input.costNote,
      timeImpact: input.timeImpact,
      timeDays: input.timeDays,
      requestedByUserId: actor.id,
      requestedByName: actor.name,
      requestedByRole: actor.role,
      assignedToUserId: assignee?.userId ?? null,
      assignedToName: assignee?.userName ?? null,
      recipientType: isClient ? "client" : "internal",
      recipientEmail: isClient ? input.recipientEmail!.trim() : null,
      designId: input.designId,
      followUpOfId: input.followUpOfId,
      status: sendNow ? "open" : "draft",
      sentAt: sendNow ? now : null,
      countersignedByUserId: sendNow ? actor.id : null,
      countersignedByName: sendNow ? actor.name : null,
      countersignedAt: sendNow ? now : null,
      dueDate: sendNow ? computeDueDate(input.kind as RequestKind, now, input.dueDays) : null,
    },
    fileRows(input.files, "request", actor.name),
  );
  await logAudit({
    entityType: "design-request",
    entityId: String(created.id),
    action: "created",
    actor: actor.name,
    summary: `${created.number} ${sendNow ? "sent to" : "drafted for"} ${assignee?.userName ?? created.recipientEmail}: ${created.subject}`,
    projectCode: created.projectCode,
  });
  if (sendNow) {
    if (!isClient) await notifyAssignee(created, `${created.kind} ${created.number} needs your response`, `${actor.name}: ${created.subject}. Due ${created.dueDate?.toISOString().slice(0, 10)}.`);
    // The request is already saved; a send failure only flips email_status.
    else created = await dispatchClientEmail(created, actor);
  } else {
    await notifications.notifyProject(created.projectCode, ["project-manager"], {
      title: `${created.number} is waiting for you to send`,
      body: `${actor.name} drafted a ${created.kind}: ${created.subject}`,
      link: link(created),
    });
  }
  return toView(created);
};

export const update = async (id: number, input: UpdateDesignRequestInput, actor: Actor) => {
  const row = await requireRequest(id);
  await assertProjectVisible(visibility(actor), row.projectCode, "requests");
  if (row.status !== "draft") throw new ConflictError("Only a draft can be edited; raise a follow-up instead");
  if (row.requestedByUserId !== actor.id && !isPmOrAdmin(actor)) throw new ForbiddenError("Only the person who drafted it, or the PM, can edit a draft");
  let assignee: { userId: number; userName: string } | undefined;
  if (input.assignedToUserId) assignee = await assertEligibleAssignee(row.projectCode, input.assignedToUserId);
  const { files, dueDays: _d, assignedToUserId: _a, recipientEmail, ...fields } = input;
  void _d;
  void _a;
  if (recipientEmail && !isClientRequest(row)) throw new ValidationError("Only a client request has a recipient email");
  const updated = await repo.update(id, {
    ...fields,
    ...(recipientEmail ? { recipientEmail: recipientEmail.trim() } : {}),
    ...(assignee ? { assignedToUserId: assignee.userId, assignedToName: assignee.userName } : {}),
  });
  if (files) await repo.replaceRequestFiles(id, files.map((f) => ({ ...f, uploadedByName: actor.name })));
  return toView(updated!);
};

/** The PM's "send": countersigns an Engineer's draft and starts the clock. */
export const send = async (id: number, actor: Actor, dueDays?: number) => {
  if (!isPmOrAdmin(actor)) throw new ForbiddenError("Only the Project Manager can send a drafted request");
  const row = await requireRequest(id);
  await assertProjectVisible(visibility(actor), row.projectCode, "requests");
  await assertProjectWritable(row.projectCode);
  if (row.status !== "draft") throw new ConflictError(`Request is ${row.status}, not a draft`);
  const now = new Date();
  const updated = (await repo.update(id, {
    status: "open",
    sentAt: now,
    countersignedByUserId: actor.id,
    countersignedByName: actor.name,
    countersignedAt: now,
    dueDate: computeDueDate(row.kind as RequestKind, now, dueDays),
  }))!;
  await logAudit({ entityType: "design-request", entityId: String(id), action: "sent", actor: actor.name, summary: `${row.number} countersigned and sent to ${row.assignedToName ?? row.recipientEmail}`, projectCode: row.projectCode });
  if (isClientRequest(updated)) return toView(await dispatchClientEmail(updated, actor));
  await notifyAssignee(updated, `${updated.kind} ${updated.number} needs your response`, `${row.requestedByName} (countersigned by ${actor.name}): ${updated.subject}`);
  return toView(updated);
};

const assertAssigneeOrAdmin = (row: DesignRequest, actor: Actor) => {
  if (actor.role !== "admin" && row.assignedToUserId !== actor.id) {
    throw new ForbiddenError("Only the person this request is assigned to can respond");
  }
};

export const acknowledge = async (id: number, actor: Actor) => {
  const row = await requireRequest(id);
  await assertProjectVisible(visibility(actor), row.projectCode, "requests");
  assertAssigneeOrAdmin(row, actor);
  if (row.status !== "open") throw new ConflictError(`Request is ${row.status}, not open`);
  return toView((await repo.update(id, { status: "in_review" }))!);
};

export const respond = async (id: number, input: RespondDesignRequestInput, actor: Actor) => {
  const row = await requireRequest(id);
  await assertProjectVisible(visibility(actor), row.projectCode, "requests");
  const client = isClientRequest(row);
  // A client request has no assignee: the sender (or PM / Admin) records the answer here.
  if (client) {
    if (!canHandleClientRequest(row, actor)) throw new ForbiddenError("Only the sender or the PM can answer a client request");
  } else {
    assertAssigneeOrAdmin(row, actor);
  }
  await assertProjectWritable(row.projectCode);
  const awaiting = client ? CLIENT_ACTIVE_STATUSES.has(row.status) : row.status === "open" || row.status === "in_review";
  if (!awaiting) throw new ConflictError(`Request is ${row.status} and is not awaiting a response`);
  if (row.kind === "RFA" && !input.outcome) throw new ValidationError("Choose an outcome: approved, approved as noted or rejected");
  const status = statusAfterResponse(row.kind as RequestKind, input.outcome);
  const now = new Date();
  const updated = (await repo.update(id, {
    status,
    responseText: input.responseText,
    respondedByUserId: actor.id,
    respondedByName: actor.name,
    respondedAt: now,
  }))!;
  await repo.addFiles(id, fileRows(input.files, "response", actor.name));
  await logAudit({ entityType: "design-request", entityId: String(id), action: "responded", actor: actor.name, summary: `${row.number} ${STATUS_LABEL[status]} by ${actor.name}`, projectCode: row.projectCode });
  const body = `${actor.name}: ${STATUS_LABEL[status]} — ${input.responseText.slice(0, 120)}`;
  const title = `${row.number} was ${row.kind === "RFI" ? "answered" : STATUS_LABEL[status].toLowerCase()}`;
  if (row.requestedByUserId && row.requestedByUserId !== actor.id) await notifications.create({ recipientUserId: row.requestedByUserId, projectCode: row.projectCode, title, body, link: link(row) });
  await notifications.notifyProject(row.projectCode, ["project-manager"], { title, body, link: link(row) });
  return toView(updated);
};

export const close = async (id: number, actor: Actor) => {
  const row = await requireRequest(id);
  await assertProjectVisible(visibility(actor), row.projectCode, "requests");
  if (row.requestedByUserId !== actor.id && !isPmOrAdmin(actor)) throw new ForbiddenError("Only the requester or the PM can close a request");
  if (row.status === "closed") throw new ConflictError("Already closed");
  const updated = (await repo.update(id, { status: "closed" }))!;
  await logAudit({ entityType: "design-request", entityId: String(id), action: "closed", actor: actor.name, summary: `${row.number} closed`, projectCode: row.projectCode });
  return toView(updated);
};

export const followUp = async (id: number, input: { requestText: string; dueDays?: number; files?: CreateDesignRequestInput["files"] }, actor: Actor) => {
  const origin = await requireRequest(id);
  const client = isClientRequest(origin);
  if (!client && !origin.assignedToUserId) throw new ValidationError("The original request has no assignee");
  return create(
    {
      kind: origin.kind as RequestKind,
      projectCode: origin.projectCode,
      discipline: origin.discipline as CreateDesignRequestInput["discipline"],
      followUpOfId: origin.id,
      sheetNumbers: origin.sheetNumbers ?? undefined,
      subject: `Follow-up: ${origin.subject}`.slice(0, 255),
      sectionsReferenced: origin.sectionsReferenced ?? undefined,
      requestText: input.requestText,
      costImpact: "none",
      timeImpact: "none",
      assignedToUserId: origin.assignedToUserId ?? undefined,
      recipientType: client ? "client" : "internal",
      recipientEmail: client ? (origin.recipientEmail ?? undefined) : undefined,
      dueDays: input.dueDays,
      designId: origin.designId ?? undefined,
      files: input.files,
    },
    actor,
  );
};

/** RFA: the "returned document" block the contractor's staff fill in. */
export const recordReturned = async (id: number, input: { returnedByName: string; returnedByPosition: string; returnedAt?: string }, actor: Actor) => {
  if (!canRaise(actor.role)) throw new ForbiddenError("Only the PM or an Engineer records the returned document");
  const row = await requireRequest(id);
  await assertProjectVisible(visibility(actor), row.projectCode, "requests");
  if (row.kind !== "RFA" || !["approved", "approved_as_noted", "rejected"].includes(row.status)) {
    throw new ConflictError("A returned document is recorded against a decided RFA");
  }
  const at = input.returnedAt ? new Date(input.returnedAt) : new Date();
  if (Number.isNaN(at.getTime())) throw new ValidationError("Invalid returned date");
  return toView((await repo.update(id, { returnedByName: input.returnedByName, returnedByPosition: input.returnedByPosition, returnedAt: at }))!);
};

// ── Client replies ────────────────────────────────────────────────────────

/** Re-sends the email of a client request. Does not touch the due date or sent date. */
export const resendEmail = async (id: number, actor: Actor) => {
  const row = await requireRequest(id);
  await assertProjectVisible(visibility(actor), row.projectCode, "requests");
  if (!isClientRequest(row)) throw new ConflictError("Only a request sent to the client can be re-emailed");
  if (!canHandleClientRequest(row, actor)) throw new ForbiddenError("Only the sender or the PM can resend this email");
  await assertProjectWritable(row.projectCode);
  if (!CLIENT_ACTIVE_STATUSES.has(row.status)) throw new ConflictError(`Request is ${row.status}; it can no longer be re-emailed`);
  if (!(await repo.claimResend(id, MAX_EMAIL_RESENDS))) throw new ConflictError(`This request has already been re-emailed ${MAX_EMAIL_RESENDS} times`);
  const updated = await dispatchClientEmail(row, actor);
  await logAudit({ entityType: "design-request", entityId: String(id), action: "email-resent", actor: actor.name, summary: `${row.number} email to ${row.recipientEmail} ${updated.emailStatus}`, projectCode: row.projectCode });
  return toView(updated);
};

/** The sender saw the client's reply in their own mailbox and records it here. */
export const markClientReplied = async (id: number, actor: Actor) => {
  const row = await requireRequest(id);
  await assertProjectVisible(visibility(actor), row.projectCode, "requests");
  if (!isClientRequest(row)) throw new ConflictError("Only a request sent to the client can be marked as client replied");
  if (!canHandleClientRequest(row, actor)) throw new ForbiddenError("Only the sender or the PM can record the client's reply");
  await assertProjectWritable(row.projectCode);
  if (row.status !== "open") throw new ConflictError(`Request is ${row.status}, not awaiting the client`);
  const updated = (await repo.update(id, { status: "client_replied", clientRepliedAt: new Date() }))!;
  await logAudit({ entityType: "design-request", entityId: String(id), action: "client-replied", actor: actor.name, summary: `${row.number} client replied`, projectCode: row.projectCode });
  return toView(updated);
};

/**
 * Tells the sender, once per request, that the client has not responded by the
 * deadline. Only requests whose email really went out ('sent') and that are
 * still 'open' qualify; a reply or closing stops it. Claim-guarded like the
 * overdue sweep, so repeat or concurrent calls never double-notify.
 */
export const sweepClientReplies = async (now: Date = new Date(), requestedByUserId?: number): Promise<{ notified: number }> => {
  const due = await repo.findClientReminderDue(now, requestedByUserId);
  let notified = 0;
  for (const r of due) {
    if (!(await repo.claimClientReminder(r.id, now))) continue;
    if (r.requestedByUserId) {
      await notifications.create({
        recipientUserId: r.requestedByUserId,
        projectCode: r.projectCode,
        title: `No client response to ${r.number}`,
        body: `${r.number} (${r.subject}) was due ${r.dueDate?.toISOString().slice(0, 10)} and the client has not responded.`,
        link: link(r),
      });
    }
    notified += 1;
  }
  return { notified };
};

// ── Deadlines ──────────────────────────────────────────────────────────────

/**
 * Notifies the assignee and the Admin once per request when it becomes overdue.
 * Safe to call repeatedly (and from several instances): `overdue_notified_at`
 * is set in the same step, and the update only wins for the first caller.
 */
export const sweepOverdue = async (now: Date = new Date()): Promise<{ notified: number }> => {
  const due = await repo.findOverdueUnnotified(now);
  let notified = 0;
  for (const r of due) {
    // Claim it first so a concurrent sweep skips it.
    const claimed = await repo.claimOverdueNotification(r.id, now);
    if (!claimed) continue;
    const body = `${r.number} (${r.subject}) was due ${r.dueDate?.toISOString().slice(0, 10)} and has no response yet.`;
    await Promise.all([
      r.assignedToUserId
        ? notifications.create({ recipientUserId: r.assignedToUserId, projectCode: r.projectCode, title: `Overdue: ${r.number}`, body, link: link(r) })
        : Promise.resolve(),
      notifications.create({ recipientRole: "admin", projectCode: r.projectCode, title: `Overdue request ${r.number}`, body: `${body} Assigned to ${r.assignedToName ?? "—"}.`, link: link(r) }),
    ]);
    notified += 1;
  }
  // The same sweep also reminds senders of client requests nobody has answered.
  notified += (await sweepClientReplies(now)).notified;
  return { notified };
};

/** Admin / Owner "Needs attention": overdue requests, drafts never sent, stalled workflow stages. */
export const getAttention = async (now: Date = new Date()) => {
  const draftCutoff = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const stalledCutoff = new Date(now.getTime() - SIGNAL_THRESHOLDS.stalledStage.warnHours * 60 * 60 * 1000);
  const [overdue, drafts, stalled] = await Promise.all([repo.findOverdue(now), repo.findUnsentDrafts(draftCutoff), repo.findStalledStages(stalledCutoff)]);
  const days = (d: Date | null) => (d ? Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000)) : 0);
  return {
    overdueRequests: overdue.map((r) => ({ id: r.id, number: r.number, subject: r.subject, projectCode: r.projectCode, assignedToName: r.assignedToName, dueDate: r.dueDate, daysOverdue: days(r.dueDate) })),
    unsentDrafts: drafts.map((r) => ({ id: r.id, number: r.number, subject: r.subject, projectCode: r.projectCode, requestedByName: r.requestedByName, daysWaiting: days(r.createdAt) })),
    stalledStages: stalled.map((s) => ({ stageId: s.stageId, workflowId: s.workflowId, workflowCode: s.workflowCode, title: s.title, projectCode: s.projectCode, roleLabel: s.roleLabel, daysStalled: days(s.updatedAt) })),
    thresholds: { stalledHours: SIGNAL_THRESHOLDS.stalledStage.warnHours, draftDays: 2 },
  };
};

/** Gate input: requests still open on a project. */
export const getOpenForProject = (projectCode: string) => repo.findOpenByProject(projectCode);
