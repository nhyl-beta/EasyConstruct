import { and, desc, eq, ilike, inArray, or, sql, SQL } from "drizzle-orm";
import { countRows, inCodes, selectPage } from "../db/paged.js";
import { db } from "../db/connection.js";
import { designEngineers } from "../db/schema/design-engineers.js";
import { designs } from "../db/schema/designs.js";
import type {
  CreateDesignInput,
  DesignFilters,
  UpdateDesignInput,
} from "./types.js";

/** id → project code for just these designs (id and project_code columns only). */
export const findProjectCodesByIds = async (ids: number[]): Promise<Map<number, string>> => {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: designs.id, projectCode: designs.projectCode })
    .from(designs)
    .where(inArray(designs.id, unique));
  return new Map(rows.map((r) => [r.id, r.projectCode]));
};

const buildConditions = (filters: DesignFilters): SQL[] => {
  const conditions: SQL[] = [];

  if (filters.codes) conditions.push(inCodes(designs.projectCode, filters.codes));

  if (filters.status && filters.status !== "all")
    conditions.push(eq(designs.status, filters.status));

  if (filters.discipline && filters.discipline !== "all")
    conditions.push(eq(designs.discipline, filters.discipline));

  if (filters.projectCode && filters.projectCode !== "all")
    conditions.push(eq(designs.projectCode, filters.projectCode));

  if (filters.search) {
    const s = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(designs.name, s),
        ilike(designs.code, s),
        ilike(designs.leadArchitect, s),
      )!,
    );
  }

  return conditions;
};

/** Designs per status inside a filter set (the KPI cards count what the list shows). */
export const statusCounts = async (filters: DesignFilters = {}) => {
  const conditions = buildConditions(filters);
  const rows = await db
    .select({ status: designs.status, count: sql<number>`count(*)::int` })
    .from(designs)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(designs.status);
  return rows.map((r) => ({ status: r.status, count: r.count }));
};

export const DESIGN_SORT_COLUMNS = {
  name: designs.name,
  code: designs.code,
  status: designs.status,
  discipline: designs.discipline,
  projectCode: designs.projectCode,
  createdAt: designs.createdAt,
  updatedAt: designs.updatedAt,
} as const;

export const defaultDesignOrder = [desc(designs.id)];

export const countFiltered = async (filters: DesignFilters = {}) => {
  const conditions = buildConditions(filters);
  return countRows(designs, conditions.length ? and(...conditions) : undefined);
};

export const findPage = async (filters: DesignFilters, window: { limit: number; offset: number }, orderBy: SQL[]) => {
  const conditions = buildConditions(filters);
  return selectPage(designs, conditions.length ? and(...conditions) : undefined, orderBy, window);
};

export const findAll = async (filters: DesignFilters = {}) => {
  const conditions = buildConditions(filters);
  return conditions.length
    ? await db
        .select()
        .from(designs)
        .where(and(...conditions))
    : await db.select().from(designs);
};

export const findById = async (id: number) => {
  const [design] = await db.select().from(designs).where(eq(designs.id, id));
  return design ?? null;
};

export const create = async (data: CreateDesignInput) => {
  const [created] = await db.insert(designs).values(data).returning();
  return created;
};

export const update = async (id: number, data: UpdateDesignInput) => {
  const [updated] = await db
    .update(designs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(designs.id, id))
    .returning();
  return updated ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db
    .delete(designs)
    .where(eq(designs.id, id))
    .returning();
  return deleted ?? null;
};

// ── Assigned engineers (many-to-many) ───────────────────────────────────────

export const findEngineersForDesigns = async (designIds: number[]) => {
  if (designIds.length === 0) return [];
  return db
    .select()
    .from(designEngineers)
    .where(inArray(designEngineers.designId, designIds));
};

export const findEngineers = async (designId: number) => {
  return db
    .select()
    .from(designEngineers)
    .where(eq(designEngineers.designId, designId));
};

/**
 * Replace a design's engineer set wholesale. The form submits the complete
 * list every time, so a diff would only add a way for the two to disagree.
 */
export const replaceEngineers = async (
  designId: number,
  engineers: Array<{ userId: number; userName: string }>,
) => {
  await db.transaction(async (tx) => {
    await tx.delete(designEngineers).where(eq(designEngineers.designId, designId));
    if (engineers.length > 0) {
      await tx.insert(designEngineers).values(
        engineers.map((e) => ({
          designId,
          userId: e.userId,
          userName: e.userName,
        })),
      );
    }
  });
};
