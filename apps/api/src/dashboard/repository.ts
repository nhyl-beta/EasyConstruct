// apps/api/src/dashboard/repository.ts
//
// The SQL behind GET /api/dashboard/summary: COUNT / GROUP BY queries and
// small LIMITed reads, instead of the full lists the dashboards used to
// download and count in the browser. Scope arguments are the same visibility
// rules the list endpoints apply (see projects/service.ts).
import { and, asc, count, desc, eq, gte, inArray, ne, sql, type SQL } from "drizzle-orm";
import { db } from "../core/db/connection.js";
import { inCodes } from "../core/db/paged.js";
import { attendance } from "../core/db/schema/attendance.js";
import { auditLogs } from "../core/db/schema/audit-logs.js";
import { budgets, expenses } from "../core/db/schema/finance.js";
import { designs } from "../core/db/schema/designs.js";
import { documents } from "../core/db/schema/documents.js";
import { employees } from "../core/db/schema/employees.js";
import { engineeringReports } from "../core/db/schema/engineering-reports.js";
import { issues } from "../core/db/schema/issues.js";
import { projectMembers } from "../core/db/schema/project-members.js";
import { projects } from "../core/db/schema/projects.js";
import { proposals } from "../core/db/schema/proposals.js";
import { requirements } from "../core/db/schema/requirements.js";
import { roles } from "../core/db/schema/roles.js";
import { tasks } from "../core/db/schema/task.js";
import { users } from "../core/db/schema/users.js";
import { workflows } from "../core/db/schema/workflows.js";
import * as projectsRepo from "../projects/repository.js";
import type { ProjectFilters } from "../projects/types.js";

/** `null` = no restriction; an array = only rows of those project codes. */
export type Codes = readonly string[] | null;

const scoped = (column: Parameters<typeof inCodes>[0], codes: Codes): SQL | undefined =>
  codes ? inCodes(column, codes) : undefined;

// ── Projects ────────────────────────────────────────────────────────────────

/**
 * Status / risk / budget / progress of the projects behind a dashboard — the
 * non-archived, in-scope list, in the list endpoint's own order (so ties break
 * the way the browser's stable sort used to). No text columns.
 */
export const projectRows = async (filters: ProjectFilters) => {
  const f: ProjectFilters = { ...filters, excludeArchived: true };
  if (f.codes && f.codes.length === 0) return [];
  // buildConditions is private to the projects repository; findPageSorted with a
  // generous window is not an option, so use the same exported pieces.
  return projectsRepo.findNarrow(f);
};

export const projectsByCodes = async (codes: string[]) => {
  if (codes.length === 0) return [];
  return db.select().from(projects).where(inArray(projects.code, codes));
};

// ── Workflows / proposals / designs ─────────────────────────────────────────

/** Active workflows (the only ones GET /workflows returns), optionally limited to project codes. */
export const activeWorkflowCount = async (codes: Codes): Promise<number> => {
  const [row] = await db
    .select({ n: count() })
    .from(workflows)
    .where(and(eq(workflows.status, "active"), scoped(workflows.projectCode, codes)));
  return row?.n ?? 0;
};

export const proposalGroups = async (codes: Codes) =>
  db
    .select({ status: proposals.status, n: sql<number>`count(*)::int` })
    .from(proposals)
    .where(scoped(proposals.projectCode, codes))
    .groupBy(proposals.status);

/** Proposals with exactly this status, newest id first (the list's own order). */
export const proposalsWithStatus = async (codes: Codes, status: string, limit: number) =>
  db
    .select()
    .from(proposals)
    .where(and(eq(proposals.status, status), scoped(proposals.projectCode, codes)))
    .orderBy(desc(proposals.id))
    .limit(limit);

/** Not-this-status proposals, most recently updated first. */
export const proposalsNotStatus = async (codes: Codes, status: string, limit: number) =>
  db
    .select()
    .from(proposals)
    .where(and(ne(proposals.status, status), scoped(proposals.projectCode, codes)))
    .orderBy(sql`${proposals.updatedAt} desc nulls last`, desc(proposals.id))
    .limit(limit);

export const designGroups = async (codes: Codes) =>
  db
    .select({ status: designs.status, n: sql<number>`count(*)::int` })
    .from(designs)
    .where(scoped(designs.projectCode, codes))
    .groupBy(designs.status);

export const recentDesigns = async (codes: Codes, limit: number) =>
  db
    .select()
    .from(designs)
    .where(scoped(designs.projectCode, codes))
    .orderBy(sql`${designs.createdAt} desc nulls last`, desc(designs.id))
    .limit(limit);

// ── Engineer: issues, reports, requirements ─────────────────────────────────

export const issueGroups = async (codes: Codes) =>
  db
    .select({ status: issues.status, n: sql<number>`count(*)::int` })
    .from(issues)
    .where(scoped(issues.projectCode, codes))
    .groupBy(issues.status);

export const reportGroups = async (codes: Codes) =>
  db
    .select({ type: engineeringReports.type, priority: engineeringReports.priority, n: sql<number>`count(*)::int` })
    .from(engineeringReports)
    .where(scoped(engineeringReports.project, codes))
    .groupBy(engineeringReports.type, engineeringReports.priority);

export const recentReports = async (codes: Codes, limit: number) =>
  db
    .select()
    .from(engineeringReports)
    .where(scoped(engineeringReports.project, codes))
    .orderBy(desc(engineeringReports.updatedAt), desc(engineeringReports.id))
    .limit(limit);

export const requirementGroups = async (codes: Codes) =>
  db
    .select({ status: requirements.status, n: sql<number>`count(*)::int` })
    .from(requirements)
    .where(scoped(requirements.project, codes))
    .groupBy(requirements.status);

/** Codes of the projects a user is staffed on in one role (project_members). */
export const memberProjectCodes = async (userId: number, role: string): Promise<string[]> => {
  const rows = await db
    .select({ code: projectMembers.projectCode })
    .from(projectMembers)
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.role, role as never)));
  return rows.map((r) => r.code);
};

// ── Tasks ───────────────────────────────────────────────────────────────────

export const taskGroupsByProject = async (codes: Codes) =>
  db
    .select({ projectCode: tasks.projectCode, status: tasks.status, n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(scoped(tasks.projectCode, codes))
    .groupBy(tasks.projectCode, tasks.status);

export const taskCountsForUser = async (userId: number) => {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`(count(*) filter (where ${tasks.status} = 'Pending'))::int`,
    })
    .from(tasks)
    .where(eq(tasks.assignedToUserId, userId));
  return row ?? { total: 0, pending: 0 };
};

/** The first rows of the task list as the list endpoint orders it (newest id first). */
export const tasksForUser = async (userId: number, limit: number) =>
  db.select().from(tasks).where(eq(tasks.assignedToUserId, userId)).orderBy(desc(tasks.id)).limit(limit);

/** Issues this user reported that are still "Submitted" (the dashboard's open-issue count). */
export const openIssuesReportedBy = async (userId: number): Promise<number> => {
  const [row] = await db
    .select({ n: count() })
    .from(issues)
    .where(and(eq(issues.reportedByUserId, userId), eq(issues.status, "Submitted")));
  return row?.n ?? 0;
};

/** The employee's attendance record for one calendar date (latest entry), if any. */
export const attendanceOn = async (employeeId: string, date: string) => {
  const [row] = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.employeeId, employeeId), eq(attendance.logDate, date)))
    .orderBy(desc(attendance.id))
    .limit(1);
  return row ?? null;
};

// ── Documents ───────────────────────────────────────────────────────────────

export const documentCount = async (): Promise<number> => {
  const [row] = await db.select({ n: count() }).from(documents);
  return row?.n ?? 0;
};

// ── Audit log ───────────────────────────────────────────────────────────────

export const auditTotal = async (): Promise<number> => {
  const [row] = await db.select({ n: count() }).from(auditLogs);
  return row?.n ?? 0;
};

export const recentAudit = async (limit: number) =>
  db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(limit);

/** Actors by number of log rows; equal counts go to whoever acted most recently (first in the newest-first list). */
export const auditActorCounts = async (limit: number) =>
  db
    .select({ actor: auditLogs.actor, count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .groupBy(auditLogs.actor)
    .orderBy(desc(sql`count(*)`), desc(sql`max(${auditLogs.createdAt})`))
    .limit(limit);

export const auditSensitiveCount = async (actions: string[]): Promise<number> => {
  const [row] = await db.select({ n: count() }).from(auditLogs).where(inArray(auditLogs.action, actions));
  return row?.n ?? 0;
};

export const recentAuditForEntity = async (entityType: string, limit: number) =>
  db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.entityType, entityType))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit);

// ── Users / roles (IT designer) ─────────────────────────────────────────────

export const userRows = async () =>
  db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
    .from(users)
    .orderBy(asc(users.id));

export const roleRows = async () =>
  db.select({ id: roles.id, name: roles.name, label: roles.label }).from(roles).orderBy(asc(roles.id));

// ── Workforce (HR) ──────────────────────────────────────────────────────────

export const employeeRowsForWorkforce = async () =>
  db
    .select({ employeeId: employees.employeeId, site: employees.site, status: employees.status })
    .from(employees);

/** Per employee: the longest shift they logged in the last `days` days (one row each). */
export const recentAttendanceByEmployee = async (days: number) =>
  db
    .select({
      employeeId: attendance.employeeId,
      hours: sql<string | null>`max(${attendance.hours})`,
    })
    .from(attendance)
    .where(gte(attendance.logDate, sql`(now() - ${days} * interval '1 day')`))
    .groupBy(attendance.employeeId);

// ── Finance ─────────────────────────────────────────────────────────────────

/** One row per budget line: project and planned amount (as a number, like GET /finance/budgets). */
export const budgetAllocation = async () =>
  (await db.select({ project: budgets.project, planned: budgets.planned }).from(budgets).orderBy(asc(budgets.id))).map(
    (b) => ({ project: b.project, planned: Number(b.planned) }),
  );

/** The newest `limit` expenses — the same window GET /finance/expenses serves by default. */
export const recentExpenses = async (limit: number) =>
  db.select().from(expenses).orderBy(desc(expenses.submittedAt)).limit(limit);

