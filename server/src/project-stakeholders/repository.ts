// server/src/project-stakeholders/repository.ts (client demo change #4)
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/connection.js";
import { projectStakeholders, type ProjectStakeholder } from "../db/schema/project-stakeholders.js";
import { projects } from "../db/schema/projects.js";

export type StakeholderInsert = {
  projectCode: string;
  name: string;
  company?: string | null;
  role: string;
  email?: string | null;
  phone?: string | null;
  createdBy?: string | null;
};

export const findByProject = (projectCode: string): Promise<ProjectStakeholder[]> =>
  db.select().from(projectStakeholders).where(eq(projectStakeholders.projectCode, projectCode)).orderBy(asc(projectStakeholders.id));

export const findByIds = (ids: number[]): Promise<ProjectStakeholder[]> =>
  ids.length === 0 ? Promise.resolve([]) : db.select().from(projectStakeholders).where(inArray(projectStakeholders.id, ids));

export const findById = async (id: number): Promise<ProjectStakeholder | null> => {
  const [row] = await db.select().from(projectStakeholders).where(eq(projectStakeholders.id, id));
  return row ?? null;
};

export const insert = async (data: StakeholderInsert): Promise<ProjectStakeholder> => {
  const [row] = await db.insert(projectStakeholders).values(data).returning();
  return row!;
};

export const insertMany = async (rows: StakeholderInsert[]): Promise<number> => {
  if (rows.length === 0) return 0;
  const inserted = await db.insert(projectStakeholders).values(rows).returning({ id: projectStakeholders.id });
  return inserted.length;
};

export const update = async (id: number, patch: Partial<Omit<StakeholderInsert, "projectCode">>): Promise<ProjectStakeholder | null> => {
  const [row] = await db
    .update(projectStakeholders)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(projectStakeholders.id, id))
    .returning();
  return row ?? null;
};

export const remove = async (id: number): Promise<ProjectStakeholder | null> => {
  const [row] = await db.delete(projectStakeholders).where(eq(projectStakeholders.id, id)).returning();
  return row ?? null;
};

/** Keeps the older single-client columns on a project in step with its first Owner. */
export const setProjectClient = async (projectCode: string, fields: { client: string; clientEmail: string | null }) => {
  await db.update(projects).set({ client: fields.client, clientEmail: fields.clientEmail, updatedAt: new Date() }).where(eq(projects.code, projectCode));
};

/** Codes of projects that already have an Owner row (for the backfill). */
export const projectCodesWithOwner = async (): Promise<Set<string>> => {
  const rows = await db
    .selectDistinct({ code: projectStakeholders.projectCode })
    .from(projectStakeholders)
    .where(eq(projectStakeholders.role, "Owner"));
  return new Set(rows.map((r) => r.code));
};

export const countByProject = async (projectCode: string): Promise<number> => {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(projectStakeholders).where(eq(projectStakeholders.projectCode, projectCode));
  return row?.n ?? 0;
};
