import { db } from "../db/connection.js";
import {
  proposals,
  type NewProposal,
} from "../db/schema/proposals.js";

import { and, desc, eq, ilike, isNull, ne, or, sql, SQL } from "drizzle-orm";
import { countRows, inCodes, selectPage } from "../db/paged.js";

export interface ProposalFilters {
  /** Restrict to these project codes (assigned-project scope; set by the controller). */
  codes?: string[];
  projectCode?: string;
  status?: string;
  search?: string;
  /** Hide this status (the architect register hides Archived). */
  excludeStatus?: string;
  /** The consultant's review queue: Pending, and assigned to the consultant or to nobody yet. */
  reviewQueue?: boolean;
}

const buildConditions = (filters: ProposalFilters): SQL[] => {
  const conditions: SQL[] = [];
  if (filters.codes) conditions.push(inCodes(proposals.projectCode, filters.codes));
  if (filters.projectCode) conditions.push(eq(proposals.projectCode, filters.projectCode));
  if (filters.status && filters.status !== "all") conditions.push(eq(proposals.status, filters.status));
  if (filters.excludeStatus) conditions.push(ne(proposals.status, filters.excludeStatus));
  if (filters.reviewQueue) {
    conditions.push(sql`lower(trim(${proposals.status})) = 'pending'`);
    conditions.push(or(isNull(proposals.assignedReviewer), sql`trim(${proposals.assignedReviewer}) = ''`, sql`lower(trim(${proposals.assignedReviewer})) = 'consultant'`)!);
  }
  if (filters.search) {
    const s = `%${filters.search}%`;
    conditions.push(or(ilike(proposals.title, s), ilike(proposals.proposalId, s), ilike(proposals.projectCode, s))!);
  }
  return conditions;
};

export const PROPOSAL_SORT_COLUMNS = {
  id: proposals.id,
  title: proposals.title,
  projectCode: proposals.projectCode,
  status: proposals.status,
  createdAt: proposals.createdAt,
  updatedAt: proposals.updatedAt,
} as const;

export const defaultProposalOrder = [desc(proposals.id)];

/** Proposals per status inside a scope (the KPI cards), ignoring the status, search and queue picked on screen. */
export const statusCounts = async (filters: ProposalFilters = {}) => {
  const conditions = buildConditions({ codes: filters.codes, projectCode: filters.projectCode, excludeStatus: filters.excludeStatus });
  const rows = await db
    .select({ status: proposals.status, count: sql<number>`count(*)::int` })
    .from(proposals)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(proposals.status);
  return rows.map((r) => ({ status: r.status, count: r.count }));
};

export const proposalRepository = {
  async countFiltered(filters: ProposalFilters = {}) {
    const conditions = buildConditions(filters);
    return countRows(proposals, conditions.length ? and(...conditions) : undefined);
  },

  async findPage(filters: ProposalFilters, window: { limit: number; offset: number }, orderBy: SQL[]) {
    const conditions = buildConditions(filters);
    return selectPage(proposals, conditions.length ? and(...conditions) : undefined, orderBy, window);
  },

  async findAll() {
    // Explicit descending order by id, so a newly-submitted proposal appears
    // at the top of the table instead of at the bottom where reviewers were
    // least likely to see it. Without an ORDER BY at all, Postgres gives no
    // ordering guarantee, so the proposal tables reshuffled between loads.
    return db
      .select()
      .from(proposals)
      .orderBy(desc(proposals.id));
  },

  async findById(id: number) {
    const result = await db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id));

    return result[0];
  },

  async findByWorkflowId(workflowId: number) {
    const result = await db
      .select()
      .from(proposals)
      .where(eq(proposals.workflowId, workflowId));

    return result[0];
  },

  async create(data: NewProposal) {
    const result = await db
      .insert(proposals)
      .values(data)
      .returning();

    return result[0];
  },

  async update(
    id: number,
    data: Partial<NewProposal>,
  ) {
    const result = await db
      .update(proposals)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, id))
      .returning();

    return result[0];
  },

  async review(
    id: number,
    data: {
      status:
        | "Approved"
        | "Revision Requested"
        | "Rejected";

      reviewerName: string;
      reviewComment: string;
    },
  ) {
    const result = await db
      .update(proposals)
      .set({
        status: data.status,
        reviewerName: data.reviewerName,
        reviewComment: data.reviewComment,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, id))
      .returning();

    return result[0];
  },

  async remove(id: number) {
    const result = await db
      .delete(proposals)
      .where(eq(proposals.id, id))
      .returning();

    return result[0];
  },
};