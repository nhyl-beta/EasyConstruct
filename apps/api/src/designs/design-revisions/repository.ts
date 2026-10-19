import { and, desc, eq, inArray, max, sql, SQL } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { designRevisions } from "../../db/schema/design-revisions.js";
import { designs } from "../../db/schema/designs.js";
import type {
  CreateDesignRevisionInput,
  DesignRevisionDetail,
  DesignRevisionFilters,
  UpdateDesignRevisionInput,
} from "./types.js";

const detailColumns = {
  id: designRevisions.id,
  designId: designRevisions.designId,
  version: designRevisions.version,
  parentVersion: designRevisions.parentVersion,
  revisionNumber: designRevisions.revisionNumber,
  reason: designRevisions.reason,
  changeSummary: designRevisions.changeSummary,
  status: designRevisions.status,
  createdBy: designRevisions.createdBy,
  createdAt: designRevisions.createdAt,
  approvedAt: designRevisions.approvedAt,
  isDemo: designRevisions.isDemo,
  designCode: designs.code,
  designName: designs.name,
  discipline: designs.discipline,
  projectCode: designs.projectCode,
};

/**
 * Revisions joined to their design (and so to the project code), newest first.
 * `projectCode` narrows to one project; `projectCodes` narrows to the set the
 * caller may see (an empty set yields nothing).
 */
export const findDetailed = async (filters: DesignRevisionFilters = {}): Promise<DesignRevisionDetail[]> => {
  const conditions: SQL[] = [];
  if (filters.designId) conditions.push(eq(designRevisions.designId, filters.designId));
  if (filters.status && filters.status !== "all") conditions.push(eq(designRevisions.status, filters.status));
  if (filters.projectCode) conditions.push(eq(designs.projectCode, filters.projectCode));
  if (filters.projectCodes) {
    if (filters.projectCodes.size === 0) return [];
    conditions.push(inArray(designs.projectCode, [...filters.projectCodes]));
  }
  const query = db
    .select(detailColumns)
    .from(designRevisions)
    .innerJoin(designs, eq(designs.id, designRevisions.designId));
  const rows = await (conditions.length ? query.where(and(...conditions)) : query).orderBy(
    desc(designRevisions.createdAt),
    desc(designRevisions.id),
  );
  return rows as DesignRevisionDetail[];
};

export const findByProjectCode = (projectCode: string, filters: Omit<DesignRevisionFilters, "projectCode"> = {}) =>
  findDetailed({ ...filters, projectCode });

export const findById = async (id: number) => {
  const [row] = await db.select().from(designRevisions).where(eq(designRevisions.id, id));
  return row ?? null;
};

export const findByDesignAndVersion = async (designId: number, version: string) => {
  const [row] = await db
    .select()
    .from(designRevisions)
    .where(and(eq(designRevisions.designId, designId), eq(designRevisions.version, version)));
  return row ?? null;
};

export const countForProject = async (projectCode: string) =>
  (await findByProjectCode(projectCode)).length;

/**
 * One transaction: lock the design row, reject a duplicate version, number the
 * revision, insert it and bring designs.version / designs.revision up to date.
 */
export const createForDesign = async (data: CreateDesignRevisionInput): Promise<{ created: typeof designRevisions.$inferSelect; duplicate: boolean }> =>
  db.transaction(async (tx) => {
    const [lockedDesign] = await tx.select({ id: designs.id, version: designs.version }).from(designs).where(eq(designs.id, data.designId)).for("update");
    const [dup] = await tx
      .select({ id: designRevisions.id })
      .from(designRevisions)
      .where(and(eq(designRevisions.designId, data.designId), eq(designRevisions.version, data.version)));
    if (dup) return { created: undefined as never, duplicate: true };

    const [topRow] = await tx
      .select({ top: max(designRevisions.revisionNumber) })
      .from(designRevisions)
      .where(eq(designRevisions.designId, data.designId));
    const revisionNumber = data.revisionNumber ?? (topRow?.top ?? 0) + 1;

    const [created] = await tx
      .insert(designRevisions)
      .values({
        designId: data.designId,
        version: data.version,
        // First revision of a design has no parent; later ones follow the design's current version unless told otherwise.
        parentVersion: data.parentVersion ?? (topRow?.top != null ? lockedDesign?.version ?? null : null),
        revisionNumber,
        reason: data.reason,
        changeSummary: data.changeSummary,
        status: data.status ?? "Draft",
        createdBy: data.createdBy,
        isDemo: data.isDemo ?? false,
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
        approvedAt: data.approvedAt ?? (data.status === "Approved" ? new Date() : undefined),
      })
      .returning();

    await tx
      .update(designs)
      .set({ version: data.version, revision: revisionNumber, updatedAt: new Date() })
      .where(eq(designs.id, data.designId));
    return { created: created!, duplicate: false };
  });

export const update = async (id: number, data: UpdateDesignRevisionInput) => {
  const { isDemo: _ignored, ...rest } = data;
  void _ignored;
  const [updated] = await db.update(designRevisions).set(rest).where(eq(designRevisions.id, id)).returning();
  return updated ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db.delete(designRevisions).where(eq(designRevisions.id, id)).returning();
  return deleted ?? null;
};

/** Deletes demo-flagged revisions, then demo-flagged designs left with none. Returns the counts. */
export const removeDemo = async (projectCode?: string) =>
  db.transaction(async (tx) => {
    const demoRevs = await tx
      .select({ id: designRevisions.id })
      .from(designRevisions)
      .innerJoin(designs, eq(designs.id, designRevisions.designId))
      .where(projectCode ? and(eq(designRevisions.isDemo, true), eq(designs.projectCode, projectCode)) : eq(designRevisions.isDemo, true));
    const ids = demoRevs.map((r) => r.id);
    if (ids.length) await tx.delete(designRevisions).where(inArray(designRevisions.id, ids));

    const demoDesigns = await tx
      .select({ id: designs.id })
      .from(designs)
      .where(projectCode ? and(eq(designs.isDemo, true), eq(designs.projectCode, projectCode)) : eq(designs.isDemo, true));
    let designsRemoved = 0;
    for (const d of demoDesigns) {
      const [still] = await tx.select({ id: designRevisions.id }).from(designRevisions).where(eq(designRevisions.designId, d.id)).limit(1);
      if (still) continue;
      // A demo design with other rows hanging off it is left alone rather than force-deleted.
      try {
        await tx.execute(sql`SAVEPOINT demo_design`);
        await tx.delete(designs).where(eq(designs.id, d.id));
        await tx.execute(sql`RELEASE SAVEPOINT demo_design`);
        designsRemoved += 1;
      } catch {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT demo_design`);
      }
    }
    return { revisionsRemoved: ids.length, designsRemoved };
  });
