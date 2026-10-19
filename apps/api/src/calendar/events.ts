// Pure rules for the calendar: who can see which projects, the date window,
// and the quiet "needs attention" flag. No database access.
import { daysBetweenIso } from "../core/utils/dates.js";

export type CalendarEventType = "milestone" | "submission" | "progress" | "task";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  date: string; // YYYY-MM-DD
  title: string;
  projectCode: string;
  projectName: string;
  detail?: string;
  /** Number id of the source row (milestone, workflow, history row or task). */
  sourceId: number;
  /** Status of the source row, as stored. */
  status?: string;
  /** Names the event involves (creator, person who made the change, assignee). */
  involves: string[];
  /** True when the signed-in user is one of the people the event involves. */
  mine: boolean;
  /** Milestone past its date and not done, or a submission still waiting for a decision. */
  attention?: "overdue" | "waiting";
}

export const MAX_RANGE_DAYS = 400;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface DateRange {
  from: string;
  to: string;
}

/** Parses ?from=&to= . Both or neither; returns null for "no window". Throws on a bad window. */
export function parseRange(from?: unknown, to?: unknown): DateRange | null {
  if (from === undefined && to === undefined) return null;
  if (typeof from !== "string" || typeof to !== "string" || !ISO.test(from) || !ISO.test(to)) {
    throw new RangeError("from and to must both be YYYY-MM-DD dates");
  }
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) throw new RangeError("from and to must be real dates");
  const span = daysBetweenIso(from, to);
  if (span < 0) throw new RangeError("from must not be after to");
  if (span > MAX_RANGE_DAYS) throw new RangeError(`the date window may not be longer than ${MAX_RANGE_DAYS} days`);
  return { from, to };
}

export const inRange = (date: string, range: DateRange | null): boolean => !range || (date >= range.from && date <= range.to);

interface ProjectLike {
  code: string;
  pmUserId?: number | null;
}

/**
 * The projects a user may see on the calendar. Mirrors lifecycle/my-actions.ts:
 * project-staffed roles see their memberships, a project manager sees their own
 * projects, every other role sees all projects.
 */
export function visibleProjects<P extends ProjectLike>(
  actor: { id: number; role: string },
  allProjects: P[],
  isMemberRole: boolean,
  memberProjectCodes: Set<string>,
): P[] {
  if (isMemberRole) return allProjects.filter((p) => memberProjectCodes.has(p.code));
  if (actor.role === "project-manager") return allProjects.filter((p) => p.pmUserId === actor.id);
  return allProjects;
}

const CLOSED_MILESTONE = new Set(["completed", "cancelled"]);

export function milestoneAttention(status: string, date: string, today: string): "overdue" | undefined {
  return !CLOSED_MILESTONE.has(status) && date < today ? "overdue" : undefined;
}

/** Workflows still in flight wait for a decision. */
export function submissionAttention(status: string): "waiting" | undefined {
  return status === "active" ? "waiting" : undefined;
}

export const sameName = (a: string | null | undefined, b: string): boolean =>
  !!a && a.trim().toLowerCase() === b.trim().toLowerCase();
