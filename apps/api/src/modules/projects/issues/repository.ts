// apps/api/src/issues/repository.ts — NEW
import { and, desc, eq, isNotNull, SQL } from "drizzle-orm";
import { db } from "../../../core/db/connection.js";
import { issues } from "../../../core/db/schema/issues.js";
import { countRows, groupCount, inCodes, selectPage } from "../../../core/db/paged.js";
import type { CreateIssueInput, IssueFilters } from "./types.js";

const buildConditions = (filters: IssueFilters): SQL[] => {
  const conditions: SQL[] = [];
  if (filters.codes) conditions.push(inCodes(issues.projectCode, filters.codes));
  if (filters.projectCode) conditions.push(eq(issues.projectCode, filters.projectCode));
  if (filters.status && filters.status !== "all") conditions.push(eq(issues.status, filters.status));
  if (filters.reportedByUserId) conditions.push(eq(issues.reportedByUserId, filters.reportedByUserId));
  return conditions;
};

export const ISSUE_SORT_COLUMNS = {
  id: issues.id,
  title: issues.title,
  status: issues.status,
  severity: issues.severity,
  category: issues.category,
  projectCode: issues.projectCode,
  createdAt: issues.createdAt,
  updatedAt: issues.updatedAt,
} as const;

export const defaultIssueOrder = [desc(issues.createdAt), desc(issues.id)];

export const countFiltered = async (filters: IssueFilters = {}) => {
  const conditions = buildConditions(filters);
  return countRows(issues, conditions.length ? and(...conditions) : undefined);
};

/** Headline counts for the KPI cards: per status and per severity over the caller's scope (status filter ignored). */
export const headlineCounts = async (filters: IssueFilters = {}) => {
  const conditions = buildConditions({ ...filters, status: undefined });
  const where = conditions.length ? and(...conditions) : undefined;
  const [statusCounts, severityCounts] = await Promise.all([
    groupCount(issues, issues.status, where),
    groupCount(issues, issues.severity, where),
  ]);
  return { statusCounts, severityCounts };
};

export const findPage = async (filters: IssueFilters, window: { limit: number; offset: number }, orderBy: SQL[]) => {
  const conditions = buildConditions(filters);
  return selectPage(issues, conditions.length ? and(...conditions) : undefined, orderBy, window);
};

export const findAll = async (filters: IssueFilters = {}) => {
  const conditions = buildConditions(filters);

  return conditions.length
    ? await db.select().from(issues).where(and(...conditions))
    : await db.select().from(issues);
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(issues).where(eq(issues.id, id));
  return row ?? null;
};

export const create = async (data: CreateIssueInput) => {
  const [created] = await db.insert(issues).values(data).returning();
  return created;
};

// ai-signals E5: same query shape as lifecycle/repository.ts's
// issuePrecedents (Group D2), but standalone by category rather than
// derived from one project's snapshot — this is the "small server
// endpoint" option chosen over re-fetching every relevant project's
// lifecycle view (which would need one call per distinct project
// represented in the engineer's cross-project issues list).
export const findResolvedPrecedentsByCategory = async (category: string, limit = 3) =>
  db
    .select({
      issueCode: issues.issueCode,
      title: issues.title,
      resolutionNotes: issues.resolutionNotes,
      updatedAt: issues.updatedAt,
    })
    .from(issues)
    .where(and(eq(issues.status, "Resolved"), eq(issues.category, category), isNotNull(issues.resolutionNotes)))
    .orderBy(desc(issues.updatedAt))
    .limit(limit);

// B2: every resolved issue that has notes, any project/category — ranking
// (issues/precedents.ts) decides what is similar enough to show.
export const findResolvedWithNotes = async () =>
  db
    .select({
      id: issues.id,
      issueCode: issues.issueCode,
      projectCode: issues.projectCode,
      title: issues.title,
      description: issues.description,
      category: issues.category,
      resolutionNotes: issues.resolutionNotes,
      updatedAt: issues.updatedAt,
    })
    .from(issues)
    .where(and(eq(issues.status, "Resolved"), isNotNull(issues.resolutionNotes)));

export const updateStatus =async (id: number, status: string, resolutionNotes?: string) => {
  const [updated] = await db
    .update(issues)
    .set({ status, resolutionNotes, updatedAt: new Date() })
    .where(eq(issues.id, id))
    .returning();
  return updated ?? null;
};