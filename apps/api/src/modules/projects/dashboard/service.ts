// apps/api/src/dashboard/service.ts
//
// GET /api/dashboard/summary: one response per role dashboard, holding only the
// totals and the few rows that dashboard actually draws. Every figure follows
// the rule the browser used when it counted full lists (see aggregates.ts), and
// is scoped like the list endpoints it replaces (a PM sees their own projects,
// a staffed role its assignments, an architect its assigned proposals and
// designs, and so on).
import * as aggregates from "./aggregates.js";
import * as repo from "./repository.js";
import { assignedCodesFor, isAssignedScoped } from "../projects/scope.js";
import { visibleProjectCodes } from "../projects/service.js";
import { getApprovalStats } from "../../workflow/index.js";
import { summaryRepository } from "../../finance/index.js";
import { cashFlowRepository } from "../../finance/index.js";
import { projectProfitabilityRepository } from "../../finance/index.js";
import { approvalsService } from "../../finance/index.js";
import { employeesRepo } from "../../workforce/index.js";
import { toConsultantView } from "../projects/service.js";
import { workforceAggregates } from "../../workforce/index.js";

export interface SummaryActor {
  id: number;
  role: string;
  name: string;
  email: string;
}

const WORKFORCE_WINDOW_DAYS = 30;

// ── Shared blocks ───────────────────────────────────────────────────────────

/** Projects block for the actor's own visible, non-archived portfolio. */
const projectsBlock = async (actor: SummaryActor, opts: { restrictTo?: string[]; top?: number } = {}) => {
  const visible = await visibleProjectCodes({ role: actor.role, userId: actor.id, name: actor.name });
  let codes: string[] | undefined = visible ? [...visible] : undefined;
  if (opts.restrictTo) {
    const allowed = new Set(opts.restrictTo);
    codes = (codes ?? opts.restrictTo).filter((c) => allowed.has(c));
  }
  const rows = await repo.projectRows(codes ? { codes } : {});

  const sorted = aggregates.attentionSorted(rows);
  const topCodes = sorted.slice(0, opts.top ?? 5).map((p) => p.code);
  const full = await repo.projectsByCodes(topCodes);
  const byCode = new Map(full.map((p) => [p.code, p]));
  const ordered = topCodes.flatMap((code) => (byCode.has(code) ? [byCode.get(code)!] : []));

  return {
    total: rows.length,
    kpis: aggregates.projectKpis(rows),
    overBudget: aggregates.overBudgetCount(rows),
    riskBreakdown: aggregates.riskBreakdown(rows),
    byPhase: aggregates.phaseCounts(rows),
    codes: rows.map((r) => r.code),
    top: actor.role === "consultant" ? ordered.map((p) => toConsultantView(p)) : ordered,
  };
};

const approvalsBlock = async (actor: SummaryActor) => {
  const visible = await visibleProjectCodes({ role: actor.role, userId: actor.id, name: actor.name });
  const stats = await getApprovalStats(actor.role, actor.name, visible);
  return { pending: stats.pending, overdue: stats.overdue };
};

const proposalsBlock = async (codes: repo.Codes) => ({
  kpis: aggregates.proposalKpis(await repo.proposalGroups(codes).then((g) => g.map((r) => ({ status: r.status, n: r.n })))),
});

const auditBlock = async (opts: { recent: number; actors?: number }) => {
  const [total, recent, actors] = await Promise.all([
    repo.auditTotal(),
    repo.recentAudit(opts.recent),
    opts.actors ? repo.auditActorCounts(opts.actors) : Promise.resolve([]),
  ]);
  return { total, recent, topActors: actors };
};

// ── Per role ────────────────────────────────────────────────────────────────

const executive = async (actor: SummaryActor, recentAudit: number) => {
  const [projects, workflowRows, approvals, proposals, audit] = await Promise.all([
    projectsBlock(actor),
    repo.workflowStatusCounts(null),
    approvalsBlock(actor),
    proposalsBlock(null),
    auditBlock({ recent: recentAudit, actors: 5 }),
  ]);
  // Org-wide, grouped by status: "completed" is only status = 'completed' (rejected ones are not counted).
  const workflows = aggregates.workflowCounts(workflowRows);
  const { codes: _codes, ...projectsOut } = projects;
  return { projects: projectsOut, workflows, approvals, proposals, audit };
};

const projectManager = async (actor: SummaryActor) => {
  const projects = await projectsBlock(actor);
  const groups = await repo.taskGroupsByProject(projects.codes);
  const workload = aggregates.taskWorkload(
    groups.map((g) => ({ projectCode: g.projectCode, status: g.status, n: g.n })),
    projects.codes,
  );
  const { codes: _codes, ...projectsOut } = projects;
  return { projects: projectsOut, workload };
};

const architect = async (actor: SummaryActor) => {
  const codes = isAssignedScoped(actor) ? [...(await assignedCodesFor(actor))] : null;
  const [designGroups, recent, proposals] = await Promise.all([
    repo.designGroups(codes),
    repo.recentDesigns(codes, 5),
    proposalsBlock(codes),
  ]);
  return {
    designs: { kpis: aggregates.designKpis(designGroups.map((g) => ({ status: g.status, n: g.n }))), recent },
    proposals,
  };
};

const engineer = async (actor: SummaryActor) => {
  const visible = await visibleProjectCodes({ role: actor.role, userId: actor.id, name: actor.name });
  const visibleCodes = visible ? [...visible] : null;
  const engineerCodes = await repo.memberProjectCodes(actor.id, "engineer");

  const [projects, issueGroups, reportGroups, recentReports, requirementGroups] = await Promise.all([
    projectsBlock(actor, { restrictTo: engineerCodes, top: 0 }),
    repo.issueGroups(engineerCodes),
    repo.reportGroups(visibleCodes),
    repo.recentReports(visibleCodes, 5),
    repo.requirementGroups(visibleCodes),
  ]);

  // assigned projects are drawn as cards, so they come back as full rows.
  const assignedRows = await repo.projectsByCodes(projects.codes);
  const orderIndex = new Map(projects.codes.map((code, i) => [code, i]));
  const assignedProjects = [...assignedRows].sort(
    (a, b) => (orderIndex.get(a.code) ?? 0) - (orderIndex.get(b.code) ?? 0),
  );

  return {
    assignedProjects,
    assignedProjectCount: assignedProjects.length,
    averageProgress: aggregates.averageProgress(assignedProjects),
    issues: aggregates.issueStats(issueGroups.map((g) => ({ status: g.status, n: g.n }))),
    reports: {
      ...aggregates.reportCounts(reportGroups.map((g) => ({ type: g.type, priority: g.priority, n: g.n }))),
      recent: recentReports,
    },
    requirements: {
      total: requirementGroups.reduce((sum, g) => sum + g.n, 0),
      pending: requirementGroups.filter((g) => g.status === "Under Review").reduce((sum, g) => sum + g.n, 0),
    },
  };
};

const consultant = async (actor: SummaryActor) => {
  const [projects, groups, awaitingRows, reviewed, documents] = await Promise.all([
    projectsBlock(actor),
    repo.proposalGroups(null),
    repo.proposalsWithStatus(null, "Pending", 5),
    repo.proposalsNotStatus(null, "Pending", 5),
    repo.documentCount(),
  ]);
  const kpis = aggregates.proposalKpis(groups.map((g) => ({ status: g.status, n: g.n })));
  const awaiting = groups.filter((g) => g.status === "Pending").reduce((sum, g) => sum + g.n, 0);
  return {
    kpis: {
      pendingReviews: kpis.pending,
      totalProposals: kpis.total,
      activeProjects: projects.kpis.total,
      advisoryDocuments: documents,
    },
    proposalsAwaitingReviewCount: awaiting,
    proposalsAwaitingReview: awaitingRows,
    recentlyReviewed: reviewed,
  };
};

const itDesigner = async () => {
  const [users, roles, audit, sensitive, accountEvents] = await Promise.all([
    repo.userRows(),
    repo.roleRows(),
    auditBlock({ recent: 8 }),
    repo.auditSensitiveCount([...aggregates.SENSITIVE_ACTIONS]),
    repo.recentAuditForEntity("user", 8),
  ]);
  const active = users.filter((u) => u.isActive).length;
  return {
    users: {
      total: users.length,
      active,
      deactivated: users.filter((u) => !u.isActive).length,
      byRole: aggregates.usersByRole(users, roles),
      orphaned: aggregates.orphanedRoleUsers(users, roles),
    },
    roles: { count: roles.length },
    audit: { total: audit.total, sensitive, recent: audit.recent, accountEvents },
  };
};

/**
 * Org-wide workforce figures (headcount, active capacity, who was on site in the
 * last 30 days, per-site utilisation). Employees and attendance are open reads
 * for every signed-in role, so this is the same for every caller.
 */
export const getWorkforce = async () => {
  const [agg, employees, recentAttendance] = await Promise.all([
    workforceAggregates(),
    repo.employeeRowsForWorkforce(),
    repo.recentAttendanceByEmployee(WORKFORCE_WINDOW_DAYS),
  ]);
  return {
    headcount: agg.totals.headcount,
    active: agg.totals.active,
    windowDays: WORKFORCE_WINDOW_DAYS,
    snapshot: aggregates.workforceSnapshot(
      employees,
      recentAttendance.map((a) => ({ employeeId: a.employeeId, hours: a.hours })),
    ),
  };
};

const humanResources = async () => ({ workforce: await getWorkforce() });

const settled = async <T>(fn: () => Promise<T>): Promise<T | null> => {
  try {
    return await fn();
  } catch (err) {
    console.error("[dashboard] finance section failed:", err instanceof Error ? err.message : err);
    return null;
  }
};

const financeManager = async () => {
  // The dashboard has always tolerated one of these failing (Promise.allSettled);
  // a failed section is null and the rest still render.
  const [kpis, budgets, expenses, cashFlow, projectProfit, approvals] = await Promise.all([
    settled(() => summaryRepository.compute()),
    settled(() => repo.budgetAllocation()),
    settled(() => repo.recentExpenses(20)),
    settled(() => cashFlowRepository.findRecent(6)),
    settled(() => projectProfitabilityRepository.compute()),
    settled(() => approvalsService.list(20)),
  ]);
  return { kpis, budgets, expenses, cashFlow, projectProfit, approvals };
};

const sitePersonnel = async (actor: SummaryActor) => {
  const today = new Date().toISOString().slice(0, 10);
  const [employee, taskCounts, tasks, openIssues, documents] = await Promise.all([
    employeesRepo.findByUserId(actor.id).then((e) => e ?? employeesRepo.findByEmail(actor.email)),
    repo.taskCountsForUser(actor.id),
    repo.tasksForUser(actor.id, 4),
    repo.openIssuesReportedBy(actor.id),
    repo.documentCount(),
  ]);
  const attendanceToday = employee ? await repo.attendanceOn(employee.employeeId, today) : null;
  return {
    attendanceToday,
    tasks: { total: taskCounts.total, pending: taskCounts.pending, first: tasks },
    issues: { open: openIssues },
    documents: { count: documents },
  };
};

export const getSummary = async (actor: SummaryActor) => {
  switch (actor.role) {
    case "owner":
      return { role: actor.role, ...(await executive(actor, 8)) };
    case "admin":
      return { role: actor.role, ...(await executive(actor, 8)) };
    case "project-manager":
      return { role: actor.role, ...(await projectManager(actor)) };
    case "architect":
      return { role: actor.role, ...(await architect(actor)) };
    case "engineer":
      return { role: actor.role, ...(await engineer(actor)) };
    case "consultant":
      return { role: actor.role, ...(await consultant(actor)) };
    case "it-designer":
      return { role: actor.role, ...(await itDesigner()) };
    case "human-resources":
      return { role: actor.role, ...(await humanResources()) };
    case "finance-manager":
      return { role: actor.role, ...(await financeManager()) };
    case "site-personnel":
      return { role: actor.role, ...(await sitePersonnel(actor)) };
    default:
      return { role: actor.role };
  }
};
