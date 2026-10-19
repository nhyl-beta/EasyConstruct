import { db }       from "../db/connection.js";
import { projects } from "../db/schema/projects.js";
import { eq, ne, ilike, and, or, isNull, inArray, sql, SQL } from 'drizzle-orm';
import type { CreateProjectInput, UpdateProjectInput, ProjectFilters } from "./types.js";

const buildConditions = (filters: ProjectFilters): SQL[] => {
  const conditions: SQL[] = [];

  if (filters.status && filters.status !== 'all')
    conditions.push(eq(projects.status, filters.status));

  if (filters.risk && filters.risk !== 'all')
    conditions.push(ilike(projects.risk, filters.risk));

  if (filters.excludeArchived) conditions.push(ne(projects.status, 'Archived'));

  if (filters.projectType && filters.projectType !== 'all')
    conditions.push(eq(projects.projectType, filters.projectType));

  if (filters.deliveryType && filters.deliveryType !== 'all')
    conditions.push(eq(projects.deliveryType, filters.deliveryType));

  // Project Manager scope — see projects/service.ts isOwnProject.
  if (filters.pmUserId != null) conditions.push(pmScope(filters.pmUserId, filters.pmName));

  if (filters.codes) conditions.push(inArray(projects.code, filters.codes));

  if (filters.code) conditions.push(eq(projects.code, filters.code));

  if (filters.search) {
    const s = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(projects.name, s),
        ilike(projects.code, s),
        ilike(projects.pm,   s),
      )!,
    );
  }

  return conditions;
};

const pmScope = (pmUserId: number, pmName?: string): SQL =>
  or(
    eq(projects.pmUserId, pmUserId),
    pmName
      ? and(isNull(projects.pmUserId), eq(projects.pm, pmName))
      : undefined,
  )!;

export const findAll = async (filters: ProjectFilters = {}) => {
  // An explicit empty code list matches nothing — and must not reach the
  // database as `IN ()`.
  if (filters.codes && filters.codes.length === 0) return [];
  const conditions = buildConditions(filters);
  return conditions.length
    ? await db.select().from(projects).where(and(...conditions))
    : await db.select().from(projects);
};

/** Project codes a Project Manager owns (code column only — no full-table read). */
export const findCodesForPm = async (pmUserId: number, pmName?: string): Promise<string[]> => {
  const rows = await db.select({ code: projects.code }).from(projects).where(pmScope(pmUserId, pmName));
  return rows.map((r) => r.code);
};

// Same ordering rule as projects/ordering.ts compareProjects, expressed in SQL:
// live work first, then Completed, Cancelled, Archived; most recently updated
// first inside a group (a null updated_at counts as oldest); id breaks ties.
export const PROJECT_SORT_COLUMNS = {
  name: projects.name,
  code: projects.code,
  status: projects.status,
  risk: projects.risk,
  progress: projects.progress,
  budget: projects.budget,
  due: projects.due,
  pm: projects.pm,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
} as const;

export const defaultOrder = [
  sql`case ${projects.status} when 'Completed' then 1 when 'Cancelled' then 2 when 'Archived' then 3 else 0 end`,
  sql`coalesce(${projects.updatedAt}, 'epoch'::timestamp) desc`,
  sql`${projects.id} desc`,
];

/** Status / risk / budget / progress columns only, in the list's own order (dashboards need no text columns). */
export const findNarrow = async (filters: ProjectFilters) => {
  if (filters.codes && filters.codes.length === 0) return [];
  const conditions = buildConditions(filters);
  return db
    .select({
      id: projects.id,
      code: projects.code,
      status: projects.status,
      risk: projects.risk,
      budget: projects.budget,
      progress: projects.progress,
    })
    .from(projects)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...defaultOrder);
};

/** Projects per status for a filter set (what the KPI strips are folded from). */
export const statusGroups = async (filters: ProjectFilters): Promise<{ status: string; n: number }[]> => {
  if (filters.codes && filters.codes.length === 0) return [];
  const conditions = buildConditions(filters);
  return db
    .select({ status: projects.status, n: sql<number>`count(*)::int` })
    .from(projects)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(projects.status);
};

export const countFiltered = async (filters: ProjectFilters): Promise<number> => {
  if (filters.codes && filters.codes.length === 0) return 0;
  const conditions = buildConditions(filters);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projects)
    .where(conditions.length ? and(...conditions) : undefined);
  return row?.n ?? 0;
};

export const findPageSorted = async (
  filters: ProjectFilters,
  limit: number,
  offset: number,
  orderBy: SQL[] = defaultOrder,
) => {
  if (filters.codes && filters.codes.length === 0) return [];
  const conditions = buildConditions(filters);
  return db
    .select()
    .from(projects)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...orderBy)
    .limit(limit)
    .offset(offset);
};

export const findByCode = async (code: string) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.code, code));
  return project ?? null;
};

export const findById = async (id: number) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));
  return project ?? null;
};

// drizzle's numeric() columns round-trip as strings, so a contract value or
// site coordinate that arrives as a JSON number has to be stringified before
// it reaches the insert. An empty-string coordinate means "clear it".
const numeric = (value: number | string | null | undefined) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return String(value);
};

const serialize = <T extends CreateProjectInput | UpdateProjectInput>(
  data: T,
): Omit<T, "contractValue" | "siteLatitude" | "siteLongitude" | "clientEmail"> & {
  clientEmail?: string | null;
  contractValue?: string | null;
  siteLatitude?: string | null;
  siteLongitude?: string | null;
} => ({
  ...data,
  contractValue:
    data.contractValue == null ? data.contractValue : String(data.contractValue),
  siteLatitude: numeric(data.siteLatitude),
  siteLongitude: numeric(data.siteLongitude),
  // A cleared field is stored as NULL, not ''.
  ...(data.clientEmail !== undefined ? { clientEmail: data.clientEmail?.trim() || null } : {}),
});

export const create = async (data: CreateProjectInput) => {
  const [created] = await db.insert(projects).values(serialize(data)).returning();
  return created;
};

export const update = async (
  id: number,
  data: UpdateProjectInput,
  pmUserId?: number | null,
) => {
  const [updated] = await db
    .update(projects)
    .set({
      ...serialize(data),
      ...(pmUserId !== undefined ? { pmUserId } : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();
  return updated ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db
    .delete(projects)
    .where(eq(projects.id, id))
    .returning();
  return deleted ?? null;
};

/**
 * Narrow, single-column update used by lifecycle/service.ts to roll a
 * project's progress up after any write that can change a gate check or
 * task count (by project CODE — most of those writers only carry the code,
 * not the numeric id). Kept separate from the general `update()` above so
 * that roll-up can never accidentally overwrite any other project field.
 */
export const updateProgressByCode = async (code: string, progress: number) => {
  const [updated] = await db
    .update(projects)
    .set({ progress, updatedAt: new Date() })
    .where(eq(projects.code, code))
    .returning();
  return updated ?? null;
};

/**
 * The lifecycle-owned columns (status/progress/previousStatus/holdReason/
 * completedAt/archivedAt) — written ONLY by lifecycle/service.ts's phase
 * transitions and refreshProjectProgress. Kept out of the general
 * `update()`/`UpdateProjectInput` path entirely (see project-validator.ts,
 * projects/routes.ts rejectLifecycleFields) so an ordinary project PATCH can
 * never reach these columns, by construction rather than by convention.
 */
export const updateLifecycleFields = async (
  code: string,
  fields: Partial<{
    status: string;
    statusTone: string;
    progress: number;
    previousStatus: string | null;
    holdReason: string | null;
    completedAt: Date | null;
    archivedAt: Date | null;
  }>,
) => {
  const [updated] = await db
    .update(projects)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(projects.code, code))
    .returning();
  return updated ?? null;
};