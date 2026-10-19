// apps/api/src/dashboard/aggregates.ts
//
// The numbers the role dashboards used to compute in the browser from full
// lists, as pure functions over narrow rows. Each one mirrors a specific
// piece of client logic (named in its comment) and aggregates.test.ts runs
// both on the same fixed sample, so the dashboards keep showing the same
// figures now that the server computes them.

/**
 * Rows may be single records or SQL GROUP BY results: `n` is how many records
 * the row stands for (default 1), so the same function folds either.
 */
export interface Weighted {
  n?: number;
}
const count = <T extends Weighted>(rows: T[], predicate: (row: T) => boolean = () => true): number =>
  rows.reduce((sum, row) => (predicate(row) ? sum + (row.n ?? 1) : sum), 0);

// ── Projects ────────────────────────────────────────────────────────────────
// client: features/projects/services/project.service.ts calcKpis

export interface ProjectStatusRow extends Weighted {
  status: string;
}

export interface ProjectKpis {
  total: number;
  onTrack: number;
  atRisk: number;
  delayed: number;
}

export const projectKpis = (rows: ProjectStatusRow[]): ProjectKpis => ({
  total: count(rows),
  onTrack: count(rows, (p) => p.status.toLowerCase().includes("on track")),
  atRisk: count(rows, (p) => p.status.toLowerCase().includes("risk")),
  delayed: count(rows, (p) => p.status.toLowerCase().includes("delay")),
});

// client: every *-dashboard.controller.ts `overBudget` (budget is utilisation %).
export const overBudgetCount = (rows: ({ budget: number } & Weighted)[]): number =>
  count(rows, (p) => p.budget > 100);

// client: features/projects/repositories/project.repository.ts normalizeRisk
export type RiskLevel = "low" | "medium" | "high";
export const normalizeRisk = (risk: string | null | undefined): RiskLevel => {
  const lower = (risk ?? "").toLowerCase();
  return lower === "low" || lower === "medium" || lower === "high" ? lower : "low";
};

// client: pm-dashboard.controller.ts riskBreakdown
export const riskBreakdown = (rows: ({ risk: string } & Weighted)[]) => ({
  high: count(rows, (p) => normalizeRisk(p.risk) === "high"),
  medium: count(rows, (p) => normalizeRisk(p.risk) === "medium"),
  low: count(rows, (p) => normalizeRisk(p.risk) === "low"),
});

// client: admin/owner/pm-dashboard.controller.ts attentionSorted — risk desc,
// then budget desc; the sort is stable, so ties keep the list's own order.
const RISK_WEIGHT: Record<RiskLevel, number> = { high: 2, medium: 1, low: 0 };
export const attentionSorted = <T extends { risk: string; budget: number }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => {
    const riskDiff = RISK_WEIGHT[normalizeRisk(b.risk)] - RISK_WEIGHT[normalizeRisk(a.risk)];
    if (riskDiff !== 0) return riskDiff;
    return b.budget - a.budget;
  });

// client: PmPortfolioCharts.tsx byPhase — counts per status, biggest first,
// equal counts in order of first appearance.
export const phaseCounts = (rows: ProjectStatusRow[]) => {
  const counts = new Map<string, number>();
  for (const p of rows) counts.set(p.status, (counts.get(p.status) ?? 0) + (p.n ?? 1));
  return Array.from(counts, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
};

// client: PmPortfolioCharts.tsx workload (top 8 projects by open tasks);
// features/tasks/hooks/use-project-task-progress.ts byProject counts.
export interface TaskProgressRow extends Weighted {
  projectCode: string;
  status: string;
}
export const taskWorkload = (tasks: TaskProgressRow[], projectCodes: string[], top = 8) => {
  const mine = new Set(projectCodes);
  const byProject = new Map<string, { projectCode: string; pending: number; inProgress: number }>();
  for (const t of tasks) {
    const entry = byProject.get(t.projectCode) ?? { projectCode: t.projectCode, pending: 0, inProgress: 0 };
    if (t.status === "Pending") entry.pending += t.n ?? 1;
    else if (t.status === "In Progress") entry.inProgress += t.n ?? 1;
    byProject.set(t.projectCode, entry);
  }
  return [...byProject.values()]
    .filter((t) => mine.has(t.projectCode))
    .map((t) => ({ project: t.projectCode, pending: t.pending, inProgress: t.inProgress }))
    .filter((t) => t.pending + t.inProgress > 0)
    .sort((a, b) => b.pending + b.inProgress - (a.pending + a.inProgress))
    .slice(0, top);
};

// client: engineer-dashboard.controller.ts averageProgress
export const averageProgress = (rows: { progress: number | null }[]): number => {
  if (rows.length === 0) return 0;
  const sum = rows.reduce((acc, p) => acc + (p.progress ?? 0), 0);
  return Math.round(sum / rows.length);
};

// ── Proposals / designs ─────────────────────────────────────────────────────
// client: features/proposals/controllers/proposal.controller.ts kpis
export const proposalKpis = (rows: ({ status: string } & Weighted)[]) => ({
  total: count(rows),
  pending: count(rows, (p) => p.status === "Pending" || p.status === "In Review"),
  approved: count(rows, (p) => p.status === "Approved"),
  revisionRequested: count(rows, (p) => p.status === "Revision Requested"),
});

// client: features/designs/controllers/design.controller.ts kpis
export const designKpis = (rows: ({ status: string } & Weighted)[]) => ({
  total: count(rows),
  inReview: count(rows, (d) => d.status === "In Review"),
  approved: count(rows, (d) => d.status === "Approved"),
  revisionNeeded: count(rows, (d) => d.status === "Revision Needed"),
});

// ── Workflows ───────────────────────────────────────────────────────────────
// client: admin/owner-dashboard.controller.ts active / completed workflow counts
export const workflowCounts = (rows: ({ status: string } & Weighted)[]) => ({
  active: count(rows, (w) => w.status === "active"),
  completed: count(rows, (w) => w.status === "completed"),
});

// ── Audit log ───────────────────────────────────────────────────────────────
// client: owner-dashboard.controller.ts topActors (Map insertion order = first
// appearance in the newest-first list; the stable sort keeps it for ties).
export const topActors = (actors: string[], top = 5) => {
  const counts = new Map<string, number>();
  for (const actor of actors) counts.set(actor, (counts.get(actor) ?? 0) + 1);
  return Array.from(counts, ([actor, count]) => ({ actor, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
};

// client: it-designer-dashboard.controller.ts
export const SENSITIVE_ACTIONS = new Set(["rejected", "deleted"]);

// ── Engineer ────────────────────────────────────────────────────────────────
// client: engineering-reports.types.ts PROGRESS_REPORT_TYPES / ISSUE_REPORT_TYPES
export const PROGRESS_REPORT_TYPES = [
  "Progress Report",
  "Site Inspection",
  "Structural Assessment",
  "Quality Inspection",
  "Technical Report",
  "Final Inspection",
];
export const ISSUE_REPORT_TYPES = ["Safety Observation", "Non-Conformance Report", "Engineering Recommendation"];

// client: engineer-dashboard.controller.ts reports.*
export const reportCounts = (rows: ({ type: string; priority: string } & Weighted)[]) => {
  const issues = rows.filter((r) => ISSUE_REPORT_TYPES.includes(r.type));
  return {
    total: count(rows),
    progressCount: count(rows, (r) => PROGRESS_REPORT_TYPES.includes(r.type)),
    issueCount: count(issues),
    criticalIssues: count(issues, (r) => r.priority === "Critical"),
  };
};

// client: engineer-dashboard.controller.ts issueStats
export const issueStats = (rows: ({ status: string } & Weighted)[]) => {
  const open = count(rows, (i) => i.status === "Submitted");
  const underReview = count(rows, (i) => i.status === "Under Review");
  const resolved = count(rows, (i) => i.status === "Resolved");
  const total = count(rows);
  return {
    total,
    open,
    underReview,
    resolved,
    // Zero issues reads as 100% — nothing outstanding.
    resolutionRate: total === 0 ? 100 : Math.round((resolved / total) * 100),
  };
};

// ── Workforce (HR) ──────────────────────────────────────────────────────────
// client: features/workforce/hooks/useWorkforceSnapshot.ts
export interface WorkforceEmployee {
  employeeId: string;
  site: string;
  status: string;
}
export interface WorkforceAttendance {
  employeeId: string;
  hours: string | number | null;
}
export const workforceSnapshot = (employees: WorkforceEmployee[], recentAttendance: WorkforceAttendance[]) => {
  const active = employees.filter((e) => e.status === "Active");
  const totalCapacity = active.length;
  const assignedEmployeeIds = new Set(recentAttendance.map((a) => a.employeeId));
  const assignedRecently = assignedEmployeeIds.size;
  const overtimeCrews = new Set(
    recentAttendance.filter((a) => Number(a.hours ?? 0) > 8).map((a) => a.employeeId),
  ).size;

  const siteMap = new Map<string, { capacity: number; assigned: number }>();
  for (const e of active) {
    const entry = siteMap.get(e.site) ?? { capacity: 0, assigned: 0 };
    entry.capacity += 1;
    siteMap.set(e.site, entry);
  }
  for (const empId of assignedEmployeeIds) {
    const emp = employees.find((e) => e.employeeId === empId);
    if (!emp) continue;
    const entry = siteMap.get(emp.site);
    if (entry) entry.assigned += 1;
  }
  return {
    totalEmployees: employees.length,
    totalCapacity,
    assignedRecently,
    available: Math.max(0, totalCapacity - assignedRecently),
    overtimeCrews,
    sites: Array.from(siteMap.entries())
      .map(([site, v]) => ({ site, capacity: v.capacity, assigned: v.assigned, available: Math.max(0, v.capacity - v.assigned) }))
      .sort((a, b) => b.capacity - a.capacity),
  };
};

// ── IT designer ─────────────────────────────────────────────────────────────
// client: it-designer-dashboard.controller.ts usersByRole / orphanedRoleUsers
export const usersByRole = (
  users: { role: string }[],
  roles: { name: string; label?: string | null }[],
) => {
  const counts = new Map<string, number>();
  for (const user of users) counts.set(user.role, (counts.get(user.role) ?? 0) + 1);
  return roles
    .map((role) => ({ name: role.name, label: role.label ?? role.name, count: counts.get(role.name) ?? 0 }))
    .sort((a, b) => b.count - a.count);
};

export const orphanedRoleUsers = <T extends { role: string }>(users: T[], roles: { name: string }[]): T[] => {
  if (roles.length === 0) return [];
  const known = new Set(roles.map((role) => role.name));
  return users.filter((user) => !known.has(user.role));
};
