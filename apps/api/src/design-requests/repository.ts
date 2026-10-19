// apps/api/src/design-requests/repository.ts
import { and, asc, desc, eq, ilike, inArray, isNull, lt, notInArray, or, sql, SQL } from "drizzle-orm";
import { db } from "../core/db/connection.js";
import {
  designRequestFiles,
  designRequestRecipients,
  designRequests,
  transmittalAcknowledgements,
  transmittalItems,
  transmittals,
  type DesignRequest,
  type DesignRequestRecipient,
  type NewDesignRequest,
} from "../core/db/schema/design-requests.js";
import { workflowStages, workflows } from "../core/db/schema/workflows.js";
import { formatControlNo, formatRequestNumber, type RequestDiscipline, type RequestKind } from "./rules.js";

export interface RequestFilters {
  projectCode?: string;
  kind?: string;
  status?: string;
  requestedByUserId?: number;
  assignedToUserId?: number;
  search?: string;
}

export const findAll = async (f: RequestFilters = {}): Promise<DesignRequest[]> => {
  const conds: SQL[] = [];
  if (f.projectCode) conds.push(eq(designRequests.projectCode, f.projectCode));
  if (f.kind) conds.push(eq(designRequests.kind, f.kind));
  if (f.status && f.status !== "all") conds.push(eq(designRequests.status, f.status));
  if (f.requestedByUserId) conds.push(eq(designRequests.requestedByUserId, f.requestedByUserId));
  if (f.assignedToUserId) conds.push(eq(designRequests.assignedToUserId, f.assignedToUserId));
  if (f.search) {
    const s = `%${f.search}%`;
    conds.push(or(ilike(designRequests.number, s), ilike(designRequests.subject, s), ilike(designRequests.sheetNumbers, s))!);
  }
  const q = db.select().from(designRequests);
  return (conds.length ? q.where(and(...conds)) : q).orderBy(desc(designRequests.createdAt), desc(designRequests.id));
};

export const findById = async (id: number): Promise<DesignRequest | null> => {
  const [row] = await db.select().from(designRequests).where(eq(designRequests.id, id));
  return row ?? null;
};

/** Several requests in one query, keyed by id. */
export const findByIds = async (ids: number[]): Promise<Map<number, DesignRequest>> => {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(designRequests).where(inArray(designRequests.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
};

export const findFollowUps = async (id: number) =>
  db.select().from(designRequests).where(eq(designRequests.followUpOfId, id)).orderBy(asc(designRequests.id));

export const findFiles = async (requestIds: number[]) =>
  requestIds.length ? db.select().from(designRequestFiles).where(inArray(designRequestFiles.requestId, requestIds)).orderBy(asc(designRequestFiles.id)) : [];

type Insertable = Omit<NewDesignRequest, "number" | "sequence" | "kind" | "projectCode" | "discipline">;

/**
 * Inserts a request with its generated number. The sequence is per
 * (project, kind, discipline) and is allocated inside a transaction holding an
 * advisory lock on that triple, so two concurrent requests never share one.
 */
export const insertNumbered = async (
  head: { kind: RequestKind; projectCode: string; discipline: RequestDiscipline; now: Date },
  data: Insertable,
  files: { stage: "request" | "response"; url: string; filename: string; contentType: string; sizeBytes: number; uploadedByName: string }[] = [],
): Promise<DesignRequest> =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`design-request:${head.projectCode}|${head.kind}|${head.discipline}`}))`);
    const [{ top }] = (await tx
      .select({ top: sql<number | null>`max(${designRequests.sequence})` })
      .from(designRequests)
      .where(and(eq(designRequests.projectCode, head.projectCode), eq(designRequests.kind, head.kind), eq(designRequests.discipline, head.discipline)))) as [{ top: number | null }];
    const sequence = (top ?? 0) + 1;
    const [created] = await tx
      .insert(designRequests)
      .values({
        ...data,
        kind: head.kind,
        projectCode: head.projectCode,
        discipline: head.discipline,
        sequence,
        number: formatRequestNumber(head.kind, head.projectCode, head.discipline, sequence, head.now),
      })
      .returning();
    if (files.length) await tx.insert(designRequestFiles).values(files.map((f) => ({ ...f, requestId: created!.id })));
    return created!;
  });

export const update = async (id: number, data: Partial<NewDesignRequest>): Promise<DesignRequest | null> => {
  const [row] = await db.update(designRequests).set({ ...data, updatedAt: new Date() }).where(eq(designRequests.id, id)).returning();
  return row ?? null;
};

export const addFiles = async (
  requestId: number,
  files: { stage: "request" | "response"; url: string; filename: string; contentType: string; sizeBytes: number; uploadedByName: string }[],
) => {
  if (files.length) await db.insert(designRequestFiles).values(files.map((f) => ({ ...f, requestId })));
};

export const replaceRequestFiles = async (
  requestId: number,
  files: { url: string; filename: string; contentType: string; sizeBytes: number; uploadedByName: string }[],
) => {
  await db.delete(designRequestFiles).where(and(eq(designRequestFiles.requestId, requestId), eq(designRequestFiles.stage, "request")));
  await addFiles(requestId, files.map((f) => ({ ...f, stage: "request" as const })));
};

export const remove = async (id: number) => {
  const [row] = await db.delete(designRequests).where(eq(designRequests.id, id)).returning();
  return row ?? null;
};

// ── Closing gate + attention list ──────────────────────────────────────────

const FINISHED = ["answered", "approved", "approved_as_noted", "rejected", "closed"];

/** Requests on a project that are still open by the gate's definition (drafts included). */
export const findOpenByProject = async (projectCode: string): Promise<DesignRequest[]> =>
  db
    .select()
    .from(designRequests)
    .where(and(eq(designRequests.projectCode, projectCode), notInArray(designRequests.status, FINISHED)))
    .orderBy(asc(designRequests.id));

/** Open requests across several projects in one query (id order, like findOpenByProject). */
export const findOpenByProjects = async (projectCodes: string[]): Promise<DesignRequest[]> =>
  projectCodes.length === 0
    ? []
    : db
        .select()
        .from(designRequests)
        .where(and(inArray(designRequests.projectCode, projectCodes), notInArray(designRequests.status, FINISHED)))
        .orderBy(asc(designRequests.id));

export const findOverdueUnnotified = async (now: Date): Promise<DesignRequest[]> =>
  db
    .select()
    .from(designRequests)
    .where(
      and(
        inArray(designRequests.status, ["open", "in_review"]),
        // Client requests have no assignee to notify; they get their own reminder below.
        eq(designRequests.recipientType, "internal"),
        lt(designRequests.dueDate, now),
        isNull(designRequests.overdueNotifiedAt),
      ),
    );

/**
 * Client requests whose response window has passed with no reply marked: still
 * "open", the email actually went out, and the sender has not been reminded.
 */
export const findClientReminderDue = async (now: Date, requestedByUserId?: number): Promise<DesignRequest[]> =>
  db
    .select()
    .from(designRequests)
    .where(
      and(
        eq(designRequests.recipientType, "client"),
        eq(designRequests.status, "open"),
        eq(designRequests.emailStatus, "sent"),
        lt(designRequests.dueDate, now),
        isNull(designRequests.clientReminderNotifiedAt),
        requestedByUserId ? eq(designRequests.requestedByUserId, requestedByUserId) : undefined,
      ),
    );

/** First caller wins, like claimOverdueNotification. */
export const claimClientReminder = async (id: number, at: Date): Promise<boolean> => {
  const rows = await db
    .update(designRequests)
    .set({ clientReminderNotifiedAt: at })
    .where(and(eq(designRequests.id, id), isNull(designRequests.clientReminderNotifiedAt)))
    .returning({ id: designRequests.id });
  return rows.length > 0;
};

/** Claims one more email attempt only while the request is under its resend limit. */
export const claimResend = async (id: number, max: number): Promise<boolean> => {
  const rows = await db
    .update(designRequests)
    .set({ emailResendCount: sql`${designRequests.emailResendCount} + 1`, updatedAt: new Date() })
    .where(and(eq(designRequests.id, id), sql`${designRequests.emailResendCount} < ${max}`))
    .returning({ id: designRequests.id });
  return rows.length > 0;
};

/** First caller wins: marks the request as notified only if nobody has yet. */
export const claimOverdueNotification = async (id: number, at: Date): Promise<boolean> => {
  const rows = await db
    .update(designRequests)
    .set({ overdueNotifiedAt: at })
    .where(and(eq(designRequests.id, id), isNull(designRequests.overdueNotifiedAt)))
    .returning({ id: designRequests.id });
  return rows.length > 0;
};

export const findOverdue = async (now: Date): Promise<DesignRequest[]> =>
  db
    .select()
    .from(designRequests)
    .where(and(inArray(designRequests.status, ["open", "in_review"]), lt(designRequests.dueDate, now)))
    .orderBy(asc(designRequests.dueDate));

export const findUnsentDrafts = async (olderThan: Date): Promise<DesignRequest[]> =>
  db
    .select()
    .from(designRequests)
    .where(and(eq(designRequests.status, "draft"), lt(designRequests.createdAt, olderThan)))
    .orderBy(asc(designRequests.createdAt));

/** Workflow stages that have been "current" with no movement since `before` (not gated behind FEATURE_AI). */
export const findStalledStages = async (before: Date) =>
  db
    .select({
      stageId: workflowStages.id,
      role: workflowStages.role,
      roleLabel: workflowStages.roleLabel,
      assignedTo: workflowStages.assignedTo,
      updatedAt: workflowStages.updatedAt,
      workflowId: workflows.id,
      workflowCode: workflows.code,
      title: workflows.title,
      projectCode: workflows.projectCode,
    })
    .from(workflowStages)
    .innerJoin(workflows, eq(workflows.id, workflowStages.workflowId))
    .where(and(eq(workflows.status, "active"), eq(workflowStages.status, "current"), lt(workflowStages.updatedAt, before)))
    .orderBy(asc(workflowStages.updatedAt));

// ── Transmittals ───────────────────────────────────────────────────────────

export const findTransmittals = async (projectCode?: string) => {
  const q = db.select().from(transmittals);
  return (projectCode ? q.where(eq(transmittals.projectCode, projectCode)) : q).orderBy(desc(transmittals.createdAt), desc(transmittals.id));
};

export const findTransmittalById = async (id: number) => {
  const [row] = await db.select().from(transmittals).where(eq(transmittals.id, id));
  if (!row) return null;
  const [items, acks] = await Promise.all([
    db.select().from(transmittalItems).where(eq(transmittalItems.transmittalId, id)).orderBy(asc(transmittalItems.position), asc(transmittalItems.id)),
    db.select().from(transmittalAcknowledgements).where(eq(transmittalAcknowledgements.transmittalId, id)).orderBy(asc(transmittalAcknowledgements.id)),
  ]);
  return { ...row, items, acknowledgements: acks };
};

export const insertTransmittal = async (
  head: { projectCode: string; now: Date },
  data: Omit<typeof transmittals.$inferInsert, "controlNo" | "sequence" | "projectCode">,
  items: { requestId?: number; particulars: string; remarks?: string }[],
) =>
  db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`transmittal:${head.projectCode}`}))`);
    const [{ top }] = (await tx
      .select({ top: sql<number | null>`max(${transmittals.sequence})` })
      .from(transmittals)
      .where(eq(transmittals.projectCode, head.projectCode))) as [{ top: number | null }];
    const sequence = (top ?? 0) + 1;
    const [created] = await tx
      .insert(transmittals)
      .values({ ...data, projectCode: head.projectCode, sequence, controlNo: formatControlNo(head.projectCode, sequence, head.now) })
      .returning();
    await tx.insert(transmittalItems).values(items.map((it, i) => ({ ...it, transmittalId: created!.id, position: i })));
    return created!;
  });

export const updateTransmittal = async (id: number, data: Partial<typeof transmittals.$inferInsert>, items?: { requestId?: number; particulars: string; remarks?: string }[]) =>
  db.transaction(async (tx) => {
    const [row] = await tx.update(transmittals).set({ ...data, updatedAt: new Date() }).where(eq(transmittals.id, id)).returning();
    if (items) {
      await tx.delete(transmittalItems).where(eq(transmittalItems.transmittalId, id));
      if (items.length) await tx.insert(transmittalItems).values(items.map((it, i) => ({ ...it, transmittalId: id, position: i })));
    }
    return row ?? null;
  });

export const addAcknowledgement = async (transmittalId: number, ack: { name: string; signature?: string; office?: string }) => {
  const [row] = await db.insert(transmittalAcknowledgements).values({ ...ack, transmittalId }).returning();
  return row!;
};

// ── Recipients of a client request (client demo change #5) ─────────────────

export const findRecipients = (requestId: number): Promise<DesignRequestRecipient[]> =>
  db.select().from(designRequestRecipients).where(eq(designRequestRecipients.requestId, requestId)).orderBy(asc(designRequestRecipients.id));

export const findRecipientsFor = (requestIds: number[]): Promise<DesignRequestRecipient[]> =>
  requestIds.length === 0
    ? Promise.resolve([])
    : db.select().from(designRequestRecipients).where(inArray(designRequestRecipients.requestId, requestIds)).orderBy(asc(designRequestRecipients.id));

export const findRecipientById = async (id: number): Promise<DesignRequestRecipient | null> => {
  const [row] = await db.select().from(designRequestRecipients).where(eq(designRequestRecipients.id, id));
  return row ?? null;
};

export const insertRecipients = async (
  requestId: number,
  rows: { stakeholderId: number | null; name: string; email: string; emailStatus?: string; sentAt?: Date | null; resendCount?: number }[],
): Promise<DesignRequestRecipient[]> =>
  rows.length === 0 ? [] : db.insert(designRequestRecipients).values(rows.map((r) => ({ ...r, requestId }))).returning();

export const replaceRecipients = async (requestId: number, rows: { stakeholderId: number | null; name: string; email: string }[]) => {
  await db.delete(designRequestRecipients).where(eq(designRequestRecipients.requestId, requestId));
  return insertRecipients(requestId, rows);
};

export const updateRecipient = async (id: number, data: Partial<typeof designRequestRecipients.$inferInsert>): Promise<DesignRequestRecipient | null> => {
  const [row] = await db.update(designRequestRecipients).set(data).where(eq(designRequestRecipients.id, id)).returning();
  return row ?? null;
};

/** Claims one more email attempt for one recipient while they are under the resend limit and have not replied. */
export const claimRecipientResend = async (id: number, max: number): Promise<boolean> => {
  const rows = await db
    .update(designRequestRecipients)
    .set({ resendCount: sql`${designRequestRecipients.resendCount} + 1` })
    .where(and(eq(designRequestRecipients.id, id), isNull(designRequestRecipients.repliedAt), sql`${designRequestRecipients.resendCount} < ${max}`))
    .returning({ id: designRequestRecipients.id });
  return rows.length > 0;
};
