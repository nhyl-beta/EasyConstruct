import { db } from "../db/connection.js";
import { projectMembers } from "../db/schema/project-members.js";
import { and, eq, SQL } from "drizzle-orm";
import { countRows, selectPage } from "../db/paged.js";
import type { CreateProjectMemberInput, ProjectMemberFilters } from "./types.js";

export const findAll = async (filters: ProjectMemberFilters = {}) => {
  const conditions: SQL[] = [];
  if (filters.projectCode) conditions.push(eq(projectMembers.projectCode, filters.projectCode));
  if (filters.userId) conditions.push(eq(projectMembers.userId, filters.userId));
  if (filters.role) conditions.push(eq(projectMembers.role, filters.role));

  return conditions.length
    ? await db.select().from(projectMembers).where(and(...conditions))
    : await db.select().from(projectMembers);
};

export const MEMBER_SORT_COLUMNS = {
  id: projectMembers.id,
  userName: projectMembers.userName,
  role: projectMembers.role,
  projectCode: projectMembers.projectCode,
  createdAt: projectMembers.createdAt,
} as const;

const memberConditions = (filters: ProjectMemberFilters): SQL[] => {
  const conditions: SQL[] = [];
  if (filters.projectCode) conditions.push(eq(projectMembers.projectCode, filters.projectCode));
  if (filters.userId) conditions.push(eq(projectMembers.userId, filters.userId));
  if (filters.role) conditions.push(eq(projectMembers.role, filters.role));
  return conditions;
};

export const countFiltered = async (filters: ProjectMemberFilters = {}) => {
  const conditions = memberConditions(filters);
  return countRows(projectMembers, conditions.length ? and(...conditions) : undefined);
};

export const findPage = async (filters: ProjectMemberFilters, window: { limit: number; offset: number }, orderBy: SQL[]) => {
  const conditions = memberConditions(filters);
  return selectPage(projectMembers, conditions.length ? and(...conditions) : undefined, orderBy, window);
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(projectMembers).where(eq(projectMembers.id, id));
  return row ?? null;
};

export const create = async (data: CreateProjectMemberInput) => {
  const [created] = await db.insert(projectMembers).values(data).returning();
  return created ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db.delete(projectMembers).where(eq(projectMembers.id, id)).returning();
  return deleted ?? null;
};
