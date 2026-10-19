import { db } from "../db/connection.js";
import { requirements } from "../db/schema/requirements.js";
import { countRows, groupCount, inCodes, selectPage } from "../db/paged.js";
import { and, desc, eq, ilike, SQL } from "drizzle-orm";
import type {
  CreateRequirementInput,
  UpdateRequirementInput,
  RequirementFilters,
} from "./types.js";

const buildConditions = (filters: RequirementFilters): SQL[] => {
  const conditions: SQL[] = [];
  if (filters.codes) conditions.push(inCodes(requirements.project, filters.codes));
  if (filters.project && filters.project !== "all") {
    conditions.push(eq(requirements.project, filters.project));
  }
  if (filters.category && filters.category !== "all") {
    conditions.push(eq(requirements.category, filters.category));
  }
  if (filters.status && filters.status !== "all") {
    conditions.push(eq(requirements.status, filters.status));
  }
  if (filters.search) {
    conditions.push(ilike(requirements.title, `%${filters.search}%`));
  }
  return conditions;
};

/** Requirements per status over the caller's scope (the status filter is ignored: these are the KPI cards). */
export const statusCounts = async (filters: RequirementFilters = {}) => {
  const conditions = buildConditions({ ...filters, status: undefined, search: undefined });
  return groupCount(requirements, requirements.status, conditions.length ? and(...conditions) : undefined);
};

export const REQUIREMENT_SORT_COLUMNS = {
  title: requirements.title,
  status: requirements.status,
  category: requirements.category,
  project: requirements.project,
  createdAt: requirements.createdAt,
  updatedAt: requirements.updatedAt,
} as const;

export const defaultRequirementOrder = [desc(requirements.updatedAt), desc(requirements.id)];

export const countFiltered = async (filters: RequirementFilters = {}) => {
  const conditions = buildConditions(filters);
  return countRows(requirements, conditions.length ? and(...conditions) : undefined);
};

export const findPage = async (filters: RequirementFilters, window: { limit: number; offset: number }, orderBy: SQL[]) => {
  const conditions = buildConditions(filters);
  return selectPage(requirements, conditions.length ? and(...conditions) : undefined, orderBy, window);
};

export const findAll = async (filters: RequirementFilters = {}) => {
  const conditions = buildConditions(filters);
  const query = db.select().from(requirements).orderBy(desc(requirements.updatedAt));
  return conditions.length ? await query.where(and(...conditions)) : await query;
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(requirements).where(eq(requirements.id, id));
  return row ?? null;
};

export const create = async (data: CreateRequirementInput) => {
  const requirementId =
    data.requirementId ??
    `REQ-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const [created] = await db
    .insert(requirements)
    .values({ ...data, requirementId })
    .returning();
  return created;
};

export const update = async (id: number, data: UpdateRequirementInput) => {
  const [updated] = await db
    .update(requirements)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(requirements.id, id))
    .returning();
  return updated ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db.delete(requirements).where(eq(requirements.id, id)).returning();
  return deleted ?? null;
};