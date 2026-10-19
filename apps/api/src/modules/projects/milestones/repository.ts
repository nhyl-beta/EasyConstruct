// apps/api/src/milestones/repository.ts — NEW
import { and, asc, eq, inArray, SQL } from "drizzle-orm";
import { countRows, inCodes, selectPage } from "../../../core/db/paged.js";
import { db } from "../../../core/db/connection.js";
import { milestones, milestoneLinks } from "../../../core/db/schema/milestones.js";
import { tasks } from "../../../core/db/schema/task.js";
import type { CreateMilestoneInput, CreateMilestoneLinkInput, UpdateMilestoneInput } from "./types.js";

export const findAll = async (projectCode?: string) => {
  const query = db.select().from(milestones).orderBy(asc(milestones.createdAt));
  return projectCode ? query.where(eq(milestones.projectCode, projectCode)) : query;
};

export interface MilestoneFilters {
  /** Restrict to these project codes (visibility scope; set by the controller). */
  codes?: string[];
  projectCode?: string;
}

const buildConditions = (filters: MilestoneFilters): SQL[] => {
  const conditions: SQL[] = [];
  if (filters.codes) conditions.push(inCodes(milestones.projectCode, filters.codes));
  if (filters.projectCode) conditions.push(eq(milestones.projectCode, filters.projectCode));
  return conditions;
};

export const MILESTONE_SORT_COLUMNS = {
  title: milestones.title,
  status: milestones.status,
  projectCode: milestones.projectCode,
  estimatedCompletionDate: milestones.estimatedCompletionDate,
  createdAt: milestones.createdAt,
} as const;

export const defaultMilestoneOrder = [asc(milestones.createdAt), asc(milestones.id)];

export const countFiltered = async (filters: MilestoneFilters = {}) => {
  const conditions = buildConditions(filters);
  return countRows(milestones, conditions.length ? and(...conditions) : undefined);
};

export const findPage = async (filters: MilestoneFilters, window: { limit: number; offset: number }, orderBy: SQL[]) => {
  const conditions = buildConditions(filters);
  return selectPage(milestones, conditions.length ? and(...conditions) : undefined, orderBy, window);
};

/** Milestones of several projects in one query, grouped by project code (each group oldest first). */
export const findAllForProjects = async (projectCodes: string[]) => {
  const grouped = new Map<string, (typeof milestones.$inferSelect)[]>();
  if (projectCodes.length === 0) return grouped;
  const rows = await db
    .select()
    .from(milestones)
    .where(inArray(milestones.projectCode, projectCodes))
    .orderBy(asc(milestones.createdAt));
  for (const row of rows) {
    const list = grouped.get(row.projectCode) ?? [];
    list.push(row);
    grouped.set(row.projectCode, list);
  }
  return grouped;
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(milestones).where(eq(milestones.id, id));
  return row ?? null;
};

export const create = async (
  data: CreateMilestoneInput & { createdBy: string; status: string },
) => {
  const [created] = await db.insert(milestones).values(data).returning();
  return created ?? null;
};

export const update = async (
  id: number,
  data: UpdateMilestoneInput & { completedBy?: string | null; completedAt?: Date | null },
) => {
  const [updated] = await db
    .update(milestones)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(milestones.id, id))
    .returning();
  return updated ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db.delete(milestones).where(eq(milestones.id, id)).returning();
  return deleted ?? null;
};

// ── Links (F4) ───────────────────────────────────────────────────────────

/**
 * Links (with the linked task's summary) for several milestones in two queries,
 * keyed by milestone id. Milestones with no links map to [].
 */
export const findLinksForMilestones = async (milestoneIds: number[]) => {
  const byMilestone = new Map<number, Array<(typeof milestoneLinks.$inferSelect) & {
    task: { id: number; title: string; status: string; assignedToUserId: number | null; assignedToName: string | null } | null | undefined;
  }>>();
  const ids = [...new Set(milestoneIds)];
  for (const id of ids) byMilestone.set(id, []);
  if (ids.length === 0) return byMilestone;

  const links = await db.select().from(milestoneLinks).where(inArray(milestoneLinks.milestoneId, ids));
  const taskLinkIds = [...new Set(links.filter((l) => l.linkType === "task").map((l) => l.linkId))];
  const linkedTasks = taskLinkIds.length
    ? await db.select().from(tasks).where(inArray(tasks.id, taskLinkIds))
    : [];
  const taskById = new Map(linkedTasks.map((t) => [t.id, t]));

  for (const link of links) {
    const list = byMilestone.get(link.milestoneId);
    if (!list) continue;
    if (link.linkType !== "task") {
      list.push({ ...link, task: undefined });
      continue;
    }
    const t = taskById.get(link.linkId);
    list.push({
      ...link,
      task: t
        ? { id: t.id, title: t.title, status: t.status, assignedToUserId: t.assignedToUserId, assignedToName: t.assignedToName }
        : null,
    });
  }
  return byMilestone;
};

export const findLinks = async (milestoneId: number) =>
  (await findLinksForMilestones([milestoneId])).get(milestoneId) ?? [];

// G2: the reverse of findLinks — given a task, which milestone(s) reference
// it, so a task completion can check whether its milestone is now fully done.
export const findMilestonesLinkedToTask = async (taskId: number) => {
  const links = await db
    .select()
    .from(milestoneLinks)
    .where(and(eq(milestoneLinks.linkType, "task"), eq(milestoneLinks.linkId, taskId)));
  const milestoneIds = [...new Set(links.map((l) => l.milestoneId))];
  if (milestoneIds.length === 0) return [];
  return db.select().from(milestones).where(inArray(milestones.id, milestoneIds));
};

export const createLink = async (milestoneId: number, data: CreateMilestoneLinkInput) => {
  const [created] = await db
    .insert(milestoneLinks)
    .values({ milestoneId, linkType: data.linkType, linkId: data.linkId })
    .returning();
  return created ?? null;
};

export const findLinkById = async (id: number) => {
  const [row] = await db.select().from(milestoneLinks).where(eq(milestoneLinks.id, id));
  return row ?? null;
};

export const removeLink = async (id: number) => {
  const [deleted] = await db.delete(milestoneLinks).where(eq(milestoneLinks.id, id)).returning();
  return deleted ?? null;
};
