// apps/api/src/issues/service.ts — NEW
import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { eq } from "drizzle-orm";
import { ForbiddenError, NotFoundError, ValidationError } from "../../../core/utils/errors.js";
import { assertProjectWritable, refreshProjectProgress } from "../lifecycle/service.js";
import { notificationsService } from "../../platform/index.js";
import * as repo from "./repository.js";
import { issues as issuesTable } from "../../../core/db/schema/issues.js";
import { orderByFor, paginate, type PageRequest } from "../../../core/utils/pagination.js";
import { projectCodesForPm } from "../projects/service.js";
import type { CreateIssueInput, IssueFilters } from "./types.js";
import { FEATURES } from "../../../core/config/features.js";
import { rankPrecedents, type RankedPrecedent } from "./precedents.js";

// ai-signals E5: decision support, read-only, never gates issue status.
export interface IssuePrecedent {
  issueCode: string;
  title: string;
  resolutionNotes: string;
  updatedAt: Date | null;
}

export const getPrecedentsByCategory = async (category: string): Promise<IssuePrecedent[]> => {
  if (!FEATURES.ai) return [];
  const rows = await repo.findResolvedPrecedentsByCategory(category);
  return rows.filter((r): r is IssuePrecedent => !!r.resolutionNotes?.trim());
};

// B2: similarity-ranked precedents for one issue (replaces the category-only
// lookup on the Engineer page). [] when the AI flag is off or nothing clears
// the similarity floor.
export const getPrecedentsForIssue = async (
  issueId: number,
  actor?: { id: number; name: string; role: string },
): Promise<RankedPrecedent[]> => {
  if (!FEATURES.ai) return [];
  const issue = await getById(issueId);
  if (actor?.role === "project-manager") {
    const mine = await projectCodesForPm({ role: actor.role, userId: actor.id, name: actor.name });
    if (!mine.has(issue.projectCode)) {
      throw new ForbiddenError("You can only view issues on projects assigned to you");
    }
  }
  return rankPrecedents(issue, await repo.findResolvedWithNotes());
};

export const getAll =async (filters: IssueFilters) => repo.findAll(filters);

export const headlineCounts = (filters: IssueFilters) => repo.headlineCounts(filters);

export const getPage = async (filters: IssueFilters, request: PageRequest) =>
  paginate(
    request,
    () => repo.countFiltered(filters),
    (window) => repo.findPage(filters, window, orderByFor(request, repo.ISSUE_SORT_COLUMNS, repo.defaultIssueOrder, issuesTable.id)),
  );

export const getById = async (id: number) => {
  const issue = await repo.findById(id);
  if (!issue) throw new NotFoundError("Issue", String(id));
  return issue;
};

export const create = async (input: CreateIssueInput) => {
  const [project] = await db.select().from(projects).where(eq(projects.code, input.projectCode));
  if (!project) {
    throw new ValidationError(`No project found with code "${input.projectCode}"`);
  }
  await assertProjectWritable(input.projectCode);
  const issue = await repo.create(input);
  if (!issue) throw new Error("Failed to create issue");
  // Gate K3 (Construction exit) reads whether any issue is Submitted/Under Review.
  await refreshProjectProgress(issue.projectCode);
  return issue;
};

// Only reviewers can set an official resolution; the reporter can only view.
export const updateStatus = async (
  id: number,
  status: string,
  resolutionNotes: string | undefined,
  actingRole: string,
  actor?: { id: number; name: string },
) => {
  const existing = await getById(id);
  if (!["project-manager", "engineer"].includes(actingRole)) {
    throw new ForbiddenError("Only Project Managers or Engineers can update issue status");
  }
  // A Project Manager reviews the issues on their own projects only.
  if (actingRole === "project-manager" && actor) {
    const mine = await projectCodesForPm({ role: actingRole, userId: actor.id, name: actor.name });
    if (!mine.has(existing.projectCode)) {
      throw new ForbiddenError("You can only review issues on projects assigned to you");
    }
  }
  await assertProjectWritable(existing.projectCode);

  // The zod schema already requires this on the Resolved transition;
  // re-checked here so the rule holds for any non-HTTP caller too.
  if (status === "Resolved" && !resolutionNotes?.trim()) {
    throw new ValidationError("Resolution notes are required to resolve an issue");
  }

  const updated = await repo.updateStatus(id, status, resolutionNotes);
  if (!updated) throw new NotFoundError("Issue", String(id));
  await refreshProjectProgress(updated.projectCode);

  if (status === "Resolved" && updated.reportedByUserId != null) {
    await notificationsService.create({
      recipientUserId: updated.reportedByUserId,
      title: "Issue resolved",
      body: `"${updated.title}" on ${updated.projectCode} was marked Resolved`,
      link: `/projects/${encodeURIComponent(updated.projectCode)}`,
      projectCode: updated.projectCode,
    });
  }

  return updated;
};