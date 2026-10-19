// apps/api/src/documents/repository.ts — NEW
import { and, desc, eq, ilike, or, sql, SQL } from "drizzle-orm";
import { countRows, inCodes, selectPage } from "../core/db/paged.js";
import { db } from "../core/db/connection.js";
import { documents } from "../core/db/schema/documents.js";
import { projects } from "../core/db/schema/projects.js";
import { proposals } from "../core/db/schema/proposals.js";
import { designs } from "../core/db/schema/designs.js";
import type { RelatedType } from "./advisory.js";
import type { CreateDocumentInput, DocumentFilters } from "./types.js";

const buildConditions = (filters: DocumentFilters): SQL[] => {
  const conditions: SQL[] = [];
  if (filters.project) conditions.push(eq(documents.project, filters.project));
  if (filters.type && filters.type !== "all") conditions.push(eq(documents.type, filters.type));
  if (filters.projectCodes) conditions.push(inCodes(documents.project, filters.projectCodes));
  if (filters.stage) conditions.push(eq(documents.stage, filters.stage));
  if (filters.search) {
    const s = `%${filters.search}%`;
    conditions.push(or(ilike(documents.title, s), ilike(documents.documentId, s))!);
  }
  return conditions;
};

export const DOCUMENT_SORT_COLUMNS = {
  title: documents.title,
  project: documents.project,
  type: documents.type,
  version: documents.version,
  uploadedBy: documents.uploadedBy,
  createdAt: documents.createdAt,
} as const;

export const defaultDocumentOrder = [desc(documents.createdAt), desc(documents.id)];

export const countFiltered = async (filters: DocumentFilters = {}) => {
  const conditions = buildConditions(filters);
  return countRows(documents, conditions.length ? and(...conditions) : undefined);
};

/** Documents per type inside a scope (the folder cards), ignoring the search and type picked on screen. */
export const typeCounts = async (filters: DocumentFilters = {}) => {
  const conditions = buildConditions({ ...filters, type: undefined, search: undefined });
  const rows = await db
    .select({ type: documents.type, count: sql<number>`count(*)::int` })
    .from(documents)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(documents.type)
    .orderBy(documents.type);
  return rows.map((r) => ({ type: r.type, count: r.count }));
};

export const findPage = async (filters: DocumentFilters, window: { limit: number; offset: number }, orderBy: SQL[]) => {
  const conditions = buildConditions(filters);
  return selectPage(documents, conditions.length ? and(...conditions) : undefined, orderBy, window);
};

export const findAll = async (filters: DocumentFilters = {}) => {
  // An explicit empty project list matches nothing (it must not become `IN ()`).
  if (filters.projectCodes && filters.projectCodes.length === 0) return [];
  const conditions = buildConditions(filters);

  return conditions.length
    ? await db.select().from(documents).where(and(...conditions))
    : await db.select().from(documents);
};

export const findProjectCodesForPm = async (pmName: string) => {
  const rows = await db.select({ code: projects.code }).from(projects).where(eq(projects.pm, pmName));
  return rows.map((r) => r.code);
};

// I: the project a proposal/design belongs to, for the same-project check.
export const findRelatedItem = async (type: RelatedType, id: number) => {
  if (type === "proposal") {
    const [row] = await db.select({ projectCode: proposals.projectCode }).from(proposals).where(eq(proposals.id, id));
    return row ?? null;
  }
  const [row] = await db.select({ projectCode: designs.projectCode }).from(designs).where(eq(designs.id, id));
  return row ?? null;
};

export const findById = async (id: number) => {
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  return row ?? null;
};

export const remove = async (id: number) => {
  const [deleted] = await db.delete(documents).where(eq(documents.id, id)).returning();
  return deleted ?? null;
};

export const create = async (data: CreateDocumentInput) => {
  const [created] = await db.insert(documents).values(data).returning();
  return created;
};