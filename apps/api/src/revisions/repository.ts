// apps/api/src/revisions/repository.ts
import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql, SQL } from "drizzle-orm";
import { db } from "../core/db/connection.js";
import { revisions, type RevisionRow } from "../core/db/schema/revisions.js";
import { designs } from "../core/db/schema/designs.js";
import { blueprints } from "../core/db/schema/blueprints.js";
import { documents } from "../core/db/schema/documents.js";
import { architectDocuments } from "../core/db/schema/architect-documents.js";
import {
  nextVersionNumber,
  normalizeItemType,
  normalizeStatus,
  statusWhenSuperseded,
  type RevisionItemType,
  type RevisionStatus,
} from "./rules.js";
import type { Revision, RevisionDetail, RevisionFilters, RevisionSummary } from "./types.js";

/** Row -> API shape: strict unions, and the storage URL replaced by a download path. */
export const normalizeRevision = (row: RevisionRow): Revision => ({
  id: row.id,
  projectCode: row.projectCode,
  architectId: row.architectId,
  createdBy: row.createdByName,
  itemType: normalizeItemType(row.itemType),
  itemId: row.itemId,
  itemTitle: row.itemTitle,
  versionNumber: row.versionNumber,
  versionLabel: row.versionLabel,
  fileName: row.fileName,
  fileSize: row.fileSize,
  mimeType: row.mimeType,
  downloadPath: `/revisions/${row.id}/download`,
  changeSummary: row.changeSummary,
  status: normalizeStatus(row.status),
  reviewedBy: row.reviewedBy,
  reviewedAt: row.reviewedAt,
  reviewComment: row.reviewComment,
  isCurrent: row.isCurrent,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const conditionsFor = (f: RevisionFilters): SQL[] => {
  const c: SQL[] = [];
  if (f.projectCodes) c.push(inArray(revisions.projectCode, f.projectCodes));
  if (f.project) c.push(eq(revisions.projectCode, f.project));
  if (f.itemType) c.push(eq(revisions.itemType, f.itemType));
  if (f.itemId != null) c.push(eq(revisions.itemId, f.itemId));
  if (f.status) c.push(eq(revisions.status, f.status));
  if (f.architectId != null) c.push(eq(revisions.architectId, f.architectId));
  if (f.currentOnly) c.push(eq(revisions.isCurrent, true));
  if (f.dateFrom) c.push(gte(revisions.createdAt, new Date(`${f.dateFrom}T00:00:00`)));
  if (f.dateTo) c.push(lte(revisions.createdAt, new Date(`${f.dateTo}T23:59:59.999`)));
  if (f.search?.trim()) {
    const s = `%${f.search.trim()}%`;
    c.push(
      or(
        ilike(revisions.itemTitle, s),
        ilike(revisions.versionLabel, s),
        ilike(revisions.changeSummary, s),
        ilike(revisions.fileName, s),
      )!,
    );
  }
  return c;
};

export const REVISION_SORT_COLUMNS = {
  createdAt: revisions.createdAt,
  versionNumber: revisions.versionNumber,
  itemTitle: revisions.itemTitle,
  projectCode: revisions.projectCode,
  status: revisions.status,
} as const;

export const defaultRevisionOrder = [desc(revisions.createdAt), desc(revisions.id)];

/** One page, newest first (id as the stable tiebreak so rows do not shuffle between pages). */
export const findPage = async (
  filters: RevisionFilters,
  limit: number,
  offset: number,
  orderBy: SQL[] = defaultRevisionOrder,
) => {
  const where = conditionsFor(filters);
  const rows = await db
    .select()
    .from(revisions)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);
  return rows.map(normalizeRevision);
};

export const countFiltered = async (filters: RevisionFilters): Promise<number> => {
  const where = conditionsFor(filters);
  const [row] = await db
    .select({ n: count() })
    .from(revisions)
    .where(where.length ? and(...where) : undefined);
  return row?.n ?? 0;
};

export const findRaw = async (id: number): Promise<RevisionRow | null> => {
  const [row] = await db.select().from(revisions).where(eq(revisions.id, id));
  return row ?? null;
};

export const findDetail = async (id: number): Promise<{ detail: RevisionDetail; fileUrl: string } | null> => {
  const row = await findRaw(id);
  if (!row) return null;
  const [prev] = await db
    .select()
    .from(revisions)
    .where(and(eq(revisions.itemType, row.itemType), eq(revisions.itemId, row.itemId), lte(revisions.versionNumber, row.versionNumber - 1)))
    .orderBy(desc(revisions.versionNumber))
    .limit(1);
  return {
    fileUrl: row.fileUrl,
    detail: {
      ...normalizeRevision(row),
      previous: prev
        ? { id: prev.id, versionNumber: prev.versionNumber, versionLabel: prev.versionLabel, status: normalizeStatus(prev.status) }
        : null,
    },
  };
};

export const findHistory = async (itemType: RevisionItemType, itemId: number) =>
  (
    await db
      .select()
      .from(revisions)
      .where(and(eq(revisions.itemType, itemType), eq(revisions.itemId, itemId)))
      .orderBy(desc(revisions.versionNumber))
  ).map(normalizeRevision);

export const summarize = async (projectCodes: string[] | undefined): Promise<RevisionSummary> => {
  const where = [eq(revisions.isCurrent, true), ...(projectCodes ? [inArray(revisions.projectCode, projectCodes)] : [])];
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${revisions.status} in ('Draft','Submitted'))::int`,
      underReview: sql<number>`count(*) filter (where ${revisions.status} = 'Under Review')::int`,
      approved: sql<number>`count(*) filter (where ${revisions.status} = 'Approved')::int`,
      rejected: sql<number>`count(*) filter (where ${revisions.status} = 'Rejected')::int`,
    })
    .from(revisions)
    .where(and(...where));
  return row ?? { total: 0, pending: 0, underReview: 0, approved: 0, rejected: 0 };
};

export const setReview = async (
  id: number,
  patch: { status: RevisionStatus; reviewedBy?: string; reviewedByUserId?: number; reviewComment?: string },
) => {
  const reviewing = patch.reviewedBy != null;
  const [row] = await db
    .update(revisions)
    .set({
      status: patch.status,
      updatedAt: new Date(),
      ...(reviewing
        ? {
            reviewedBy: patch.reviewedBy,
            reviewedByUserId: patch.reviewedByUserId,
            reviewedAt: new Date(),
            reviewComment: patch.reviewComment?.trim() || null,
          }
        : {}),
    })
    .where(eq(revisions.id, id))
    .returning();
  return row ? normalizeRevision(row) : null;
};

// ── the item a revision belongs to ───────────────────────────────────────

export interface ItemRecord {
  projectCode: string | null;
  title: string;
}

/** Looks the versioned record up in whichever table its type points at. */
export const findItemRecord = async (type: RevisionItemType, id: number): Promise<ItemRecord | null> => {
  switch (type) {
    case "design": {
      const [d] = await db.select({ code: designs.projectCode, title: designs.name }).from(designs).where(eq(designs.id, id));
      return d ? { projectCode: d.code, title: d.title } : null;
    }
    case "blueprint": {
      const [b] = await db
        .select({ code: blueprints.projectCode, designId: blueprints.designId, title: blueprints.title })
        .from(blueprints)
        .where(eq(blueprints.id, id));
      if (!b) return null;
      let code = b.code;
      if (!code && b.designId != null) {
        const [d] = await db.select({ code: designs.projectCode }).from(designs).where(eq(designs.id, b.designId));
        code = d?.code ?? null;
      }
      return { projectCode: code, title: b.title };
    }
    case "document": {
      const [d] = await db.select({ code: documents.project, title: documents.title }).from(documents).where(eq(documents.id, id));
      return d ? { projectCode: d.code, title: d.title } : null;
    }
    case "plan": {
      const [p] = await db
        .select({ code: architectDocuments.projectCode, designId: architectDocuments.designId, title: architectDocuments.title })
        .from(architectDocuments)
        .where(eq(architectDocuments.id, id));
      if (!p) return null;
      let code = p.code;
      if (!code && p.designId != null) {
        const [d] = await db.select({ code: designs.projectCode }).from(designs).where(eq(designs.id, p.designId));
        code = d?.code ?? null;
      }
      return { projectCode: code, title: p.title };
    }
  }
};

// ── creating a version ───────────────────────────────────────────────────

export interface NewVersion {
  projectCode: string;
  architectId: number;
  createdByName: string;
  itemType: RevisionItemType;
  itemId?: number;
  itemTitle: string;
  /** Start tracking a new plan: its record is created in the same transaction. */
  newPlan?: { title: string; owner: string };
  versionLabel?: string;
  changeSummary: string;
  file: { url: string; fileName: string; fileSize: number; mimeType: string };
}

/**
 * Appends the next version of an item. Runs in one transaction behind a
 * per-item advisory lock, so two uploads racing for the same item queue up and
 * get consecutive numbers instead of colliding; the unique indexes (one row per
 * item+version, one current row per item) are the backstop. The previous
 * current version is demoted (and Superseded unless it was already decided) —
 * its row is otherwise never touched.
 */
export const createVersion = async (input: NewVersion): Promise<Revision> => {
  const row = await db.transaction(async (tx) => {
    let itemId = input.itemId;
    if (itemId == null) {
      if (!input.newPlan) throw new Error("createVersion needs an item or a new plan");
      const [plan] = await tx
        .insert(architectDocuments)
        .values({
          title: input.newPlan.title,
          category: "Plan",
          owner: input.newPlan.owner,
          projectCode: input.projectCode,
          fileType: (input.file.fileName.split(".").pop() ?? "PDF").slice(0, 20).toUpperCase(),
          sizeKb: Math.ceil(input.file.fileSize / 1024),
          status: "Draft",
        })
        .returning({ id: architectDocuments.id });
      itemId = plan!.id;
    }

    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.itemType}:${itemId}`}, 0))`);

    const existing = await tx
      .select({ id: revisions.id, versionNumber: revisions.versionNumber, status: revisions.status, isCurrent: revisions.isCurrent })
      .from(revisions)
      .where(and(eq(revisions.itemType, input.itemType), eq(revisions.itemId, itemId)));

    const previous = existing.find((r) => r.isCurrent);
    if (previous) {
      await tx
        .update(revisions)
        .set({ isCurrent: false, status: statusWhenSuperseded(normalizeStatus(previous.status)), updatedAt: new Date() })
        .where(eq(revisions.id, previous.id));
    }

    const [created] = await tx
      .insert(revisions)
      .values({
        projectCode: input.projectCode,
        architectId: input.architectId,
        createdByName: input.createdByName,
        itemType: input.itemType,
        itemId,
        itemTitle: input.newPlan?.title ?? input.itemTitle,
        versionNumber: nextVersionNumber(existing.map((r) => r.versionNumber)),
        versionLabel: input.versionLabel || null,
        fileUrl: input.file.url,
        fileName: input.file.fileName,
        fileSize: input.file.fileSize,
        mimeType: input.file.mimeType,
        changeSummary: input.changeSummary,
        status: "Submitted",
        isCurrent: true,
      })
      .returning();
    return created!;
  });
  return normalizeRevision(row);
};
