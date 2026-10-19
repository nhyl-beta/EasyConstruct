import { db } from "../db/connection.js";
import { engineeringReports } from "../db/schema/engineering-reports.js";
import { countRows, inCodes, selectPage } from "../db/paged.js";
import { and, desc, eq, ilike, inArray, sql, SQL } from "drizzle-orm";
import type {
  CreateEngineeringReportInput,
  UpdateEngineeringReportInput,
  EngineeringReportFilters,
} from "./types.js";

const buildConditions = (filters: EngineeringReportFilters): SQL[] => {
  const conditions: SQL[] = [];
  if (filters.codes) conditions.push(inCodes(engineeringReports.project, filters.codes));
  if (filters.project && filters.project !== "all") {
    conditions.push(eq(engineeringReports.project, filters.project));
  }
  // `type` / `status` take one value or a comma-separated list ("Submitted,Under Review").
  if (filters.type && filters.type !== "all") {
    const list = filters.type.split(",").map((v) => v.trim()).filter(Boolean);
    conditions.push(list.length > 1 ? inArray(engineeringReports.type, list) : eq(engineeringReports.type, list[0] ?? filters.type));
  }
  if (filters.status && filters.status !== "all") {
    const list = filters.status.split(",").map((v) => v.trim()).filter(Boolean);
    conditions.push(list.length > 1 ? inArray(engineeringReports.status, list) : eq(engineeringReports.status, list[0] ?? filters.status));
  }
  if (filters.search) {
    conditions.push(ilike(engineeringReports.title, `%${filters.search}%`));
  }
  return conditions;
};

/** Reports per (type, status) inside a scope - the KPI cards derive their counts from it. Status and search are ignored. */
export const typeStatusCounts = async (filters: EngineeringReportFilters = {}) => {
  const conditions = buildConditions({ ...filters, status: undefined, search: undefined });
  const rows = await db
    .select({ type: engineeringReports.type, status: engineeringReports.status, count: sql<number>`count(*)::int` })
    .from(engineeringReports)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(engineeringReports.type, engineeringReports.status);
  return rows.map((r) => ({ type: r.type, status: r.status, count: r.count }));
};

export const REPORT_SORT_COLUMNS = {
  title: engineeringReports.title,
  type: engineeringReports.type,
  project: engineeringReports.project,
  priority: engineeringReports.priority,
  status: engineeringReports.status,
  date: engineeringReports.date,
  createdAt: engineeringReports.createdAt,
  updatedAt: engineeringReports.updatedAt,
} as const;

export const defaultReportOrder = [desc(engineeringReports.updatedAt), desc(engineeringReports.id)];

export const countFiltered = async (filters: EngineeringReportFilters = {}) => {
  const conditions = buildConditions(filters);
  return countRows(engineeringReports, conditions.length ? and(...conditions) : undefined);
};

export const findPage = async (filters: EngineeringReportFilters, window: { limit: number; offset: number }, orderBy: SQL[]) => {
  const conditions = buildConditions(filters);
  return selectPage(engineeringReports, conditions.length ? and(...conditions) : undefined, orderBy, window);
};

export const findAll = async (filters: EngineeringReportFilters = {}) => {
  const conditions = buildConditions(filters);
  const query = db
    .select()
    .from(engineeringReports)
    .orderBy(desc(engineeringReports.updatedAt));
  return conditions.length ? await query.where(and(...conditions)) : await query;
};

export const findById = async (id: number) => {
  const [row] = await db
    .select()
    .from(engineeringReports)
    .where(eq(engineeringReports.id, id));
  return row ?? null;
};

export const create = async (data: CreateEngineeringReportInput & { reportId: string }) => {
  const [created] = await db.insert(engineeringReports).values(data).returning();
  return created;
};

export const update = async (id: number, data: UpdateEngineeringReportInput) => {
  const [updated] = await db
    .update(engineeringReports)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(engineeringReports.id, id))
    .returning();
  return updated ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db
    .delete(engineeringReports)
    .where(eq(engineeringReports.id, id))
    .returning();
  return deleted ?? null;
};