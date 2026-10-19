// Compares the server-side dashboard aggregates with the browser-side logic they
// replace, run on the same fixed sample. The `client*` functions below are the
// original client code, copied verbatim (file named on each) so a drift in
// either side fails here.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import * as agg from "./aggregates.js";

// ── Fixed sample: what GET /projects, /proposals … returned for one user ────
const projects = [
  { id: 1, code: "P-1", status: "Construction", risk: "High", budget: 120, progress: 40 },
  { id: 2, code: "P-2", status: "Design", risk: "Low", budget: 90, progress: 10 },
  { id: 3, code: "P-3", status: "On Hold", risk: "Medium", budget: 150, progress: 70 },
  { id: 4, code: "P-4", status: "Construction", risk: "High", budget: 200, progress: 55 },
  { id: 5, code: "P-5", status: "Completed", risk: "weird", budget: 100, progress: 100 },
  { id: 6, code: "P-6", status: "Delayed - on track to risk review", risk: "Medium", budget: 101, progress: 20 },
  { id: 7, code: "P-7", status: "Design", risk: "High", budget: 120, progress: 33 },
];

const proposals = [
  { status: "Pending" }, { status: "In Review" }, { status: "Approved" }, { status: "Pending" },
  { status: "Revision Requested" }, { status: "Rejected" }, { status: "Approved" },
];
const designs = [
  { status: "In Review" }, { status: "Approved" }, { status: "Revision Needed" }, { status: "Draft" }, { status: "In Review" },
];
const issuesRows = [
  { status: "Submitted" }, { status: "Under Review" }, { status: "Resolved" }, { status: "Resolved" }, { status: "Submitted" },
];
const reports = [
  { type: "Progress Report", priority: "Low" },
  { type: "Safety Observation", priority: "Critical" },
  { type: "Non-Conformance Report", priority: "High" },
  { type: "Safety Observation", priority: "Critical" },
  { type: "Site Inspection", priority: "Critical" },
  { type: "Something Else", priority: "Critical" },
];
const auditActors = ["ana", "ben", "ana", "cy", "ben", "ana", "dee", "cy", "eve", "fay", "gus"];

// Group rows the way the SQL does.
const grouped = <T extends Record<string, unknown>>(rows: T[], keys: (keyof T)[]) => {
  const map = new Map<string, T & { n: number }>();
  for (const r of rows) {
    const k = keys.map((key) => String(r[key])).join("|");
    const hit = map.get(k);
    if (hit) hit.n += 1;
    else map.set(k, { ...r, n: 1 });
  }
  return [...map.values()];
};

// ── client logic, verbatim ──────────────────────────────────────────────────
// features/projects/services/project.service.ts
const clientCalcKpis = (list: { status: string }[]) => {
  const total = list.length;
  const onTrack = list.filter((p) => p.status.toLowerCase().includes("on track")).length;
  const atRisk = list.filter((p) => p.status.toLowerCase().includes("risk")).length;
  const delayed = list.filter((p) => p.status.toLowerCase().includes("delay")).length;
  return { total, onTrack, atRisk, delayed };
};
// features/projects/repositories/project.repository.ts
const VALID_RISKS = ["low", "medium", "high"];
const clientNormalizeRisk = (risk: string | undefined) => {
  const lower = (risk ?? "").toLowerCase();
  return VALID_RISKS.includes(lower) ? lower : "low";
};
// features/dashboard/controllers/pm-dashboard.controller.ts
const clientRiskBreakdown = (list: { risk: string }[]) => ({
  high: list.filter((p) => clientNormalizeRisk(p.risk) === "high").length,
  medium: list.filter((p) => clientNormalizeRisk(p.risk) === "medium").length,
  low: list.filter((p) => clientNormalizeRisk(p.risk) === "low").length,
});
const clientOverBudget = (list: { budget: number }[]) => list.filter((p) => p.budget > 100).length;
const clientAttentionSorted = <T extends { risk: string; budget: number }>(list: T[]) => {
  const riskWeight: Record<string, number> = { high: 2, medium: 1, low: 0 };
  return [...list].sort((a, b) => {
    const riskDiff = riskWeight[clientNormalizeRisk(b.risk)]! - riskWeight[clientNormalizeRisk(a.risk)]!;
    if (riskDiff !== 0) return riskDiff;
    return b.budget - a.budget;
  });
};
// features/dashboard/components/PmPortfolioCharts.tsx
const clientByPhase = (list: { status: string }[]) => {
  const counts = new Map<string, number>();
  for (const p of list) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
  return Array.from(counts, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
};
// features/proposals/controllers/proposal.controller.ts
const clientProposalKpis = (list: { status: string }[]) => ({
  total: list.length,
  pending: list.filter((p) => p.status === "Pending" || p.status === "In Review").length,
  approved: list.filter((p) => p.status === "Approved").length,
  revisionRequested: list.filter((p) => p.status === "Revision Requested").length,
});
// features/designs/controllers/design.controller.ts
const clientDesignKpis = (list: { status: string }[]) => ({
  total: list.length,
  inReview: list.filter((d) => d.status === "In Review").length,
  approved: list.filter((d) => d.status === "Approved").length,
  revisionNeeded: list.filter((d) => d.status === "Revision Needed").length,
});
// features/dashboard/controllers/engineer-dashboard.controller.ts
const clientIssueStats = (assignedIssues: { status: string }[]) => {
  const open = assignedIssues.filter((i) => i.status === "Submitted").length;
  const underReview = assignedIssues.filter((i) => i.status === "Under Review").length;
  const resolved = assignedIssues.filter((i) => i.status === "Resolved").length;
  const total = assignedIssues.length;
  return { total, open, underReview, resolved, resolutionRate: total === 0 ? 100 : Math.round((resolved / total) * 100) };
};
const clientAverageProgress = (assigned: { progress?: number }[]) => {
  if (assigned.length === 0) return 0;
  const sum = assigned.reduce((acc, p) => acc + (p.progress ?? 0), 0);
  return Math.round(sum / assigned.length);
};
// features/engineering-reports (service + types)
const CLIENT_PROGRESS = ["Progress Report", "Site Inspection", "Structural Assessment", "Quality Inspection", "Technical Report", "Final Inspection"];
const CLIENT_ISSUE = ["Safety Observation", "Non-Conformance Report", "Engineering Recommendation"];
const clientReportCounts = (list: { type: string; priority: string }[]) => {
  const issueReports = list.filter((r) => CLIENT_ISSUE.includes(r.type));
  const progressReports = list.filter((r) => CLIENT_PROGRESS.includes(r.type));
  return {
    total: list.length,
    progressCount: progressReports.length,
    issueCount: issueReports.length,
    criticalIssues: issueReports.filter((r) => r.priority === "Critical").length,
  };
};
// features/dashboard/controllers/owner-dashboard.controller.ts
const clientTopActors = (actors: string[]) => {
  const counts = new Map<string, number>();
  for (const actor of actors) counts.set(actor, (counts.get(actor) ?? 0) + 1);
  return Array.from(counts, ([actor, count]) => ({ actor, count })).sort((a, b) => b.count - a.count).slice(0, 5);
};
// features/dashboard/controllers/it-designer-dashboard.controller.ts
const clientUsersByRole = (users: { role: string }[], roles: { name: string; label: string }[]) => {
  const counts = new Map<string, number>();
  for (const user of users) counts.set(user.role, (counts.get(user.role) ?? 0) + 1);
  return roles.map((role) => ({ name: role.name, label: role.label, count: counts.get(role.name) ?? 0 })).sort((a, b) => b.count - a.count);
};
// features/workforce/hooks/useWorkforceSnapshot.ts (the part after the fetch)
const clientWorkforce = (
  employees: { employeeId: string; site: string; status: string }[],
  recentAttendance: { employeeId: string; hours: string | number | null }[],
) => {
  const active = employees.filter((e) => e.status === "Active");
  const totalCapacity = active.length;
  const assignedEmployeeIds = new Set(recentAttendance.map((a) => a.employeeId));
  const assignedRecently = assignedEmployeeIds.size;
  const available = Math.max(0, totalCapacity - assignedRecently);
  const overtimeCrews = new Set(recentAttendance.filter((a) => Number(a.hours ?? 0) > 8).map((a) => a.employeeId)).size;
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
  const sites = Array.from(siteMap.entries())
    .map(([site, v]) => ({ site, capacity: v.capacity, assigned: v.assigned, available: Math.max(0, v.capacity - v.assigned) }))
    .sort((a, b) => b.capacity - a.capacity);
  return { totalEmployees: employees.length, totalCapacity, assignedRecently, available, overtimeCrews, sites };
};

describe("dashboard aggregates equal the browser-side logic", () => {
  test("project KPIs, over-budget, risk breakdown", () => {
    assert.deepEqual(agg.projectKpis(projects), clientCalcKpis(projects));
    assert.deepEqual(agg.overBudgetCount(projects), clientOverBudget(projects));
    assert.deepEqual(agg.riskBreakdown(projects), clientRiskBreakdown(projects));
    // the same figures when the rows arrive as SQL GROUP BY results
    const groupedProjects = grouped(projects, ["status"]);
    assert.deepEqual(agg.projectKpis(groupedProjects), clientCalcKpis(projects));
    assert.deepEqual(agg.riskBreakdown(grouped(projects, ["risk"])), clientRiskBreakdown(projects));
    assert.deepEqual(agg.overBudgetCount(grouped(projects.map((p) => ({ budget: p.budget > 100 ? 101 : 0 })), ["budget"])), clientOverBudget(projects));
  });

  test("attention order: risk, then budget, ties keep the list's own order", () => {
    assert.deepEqual(
      agg.attentionSorted(projects).map((p) => p.code),
      clientAttentionSorted(projects).map((p) => p.code),
    );
    assert.deepEqual(agg.attentionSorted(projects).slice(0, 5).map((p) => p.code), ["P-4", "P-1", "P-7", "P-3", "P-6"]);
  });

  test("projects by phase", () => {
    assert.deepEqual(agg.phaseCounts(projects), clientByPhase(projects));
    assert.deepEqual(agg.phaseCounts(grouped(projects, ["status"])), clientByPhase(projects));
  });

  test("proposal and design KPIs", () => {
    assert.deepEqual(agg.proposalKpis(proposals), clientProposalKpis(proposals));
    assert.deepEqual(agg.proposalKpis(grouped(proposals, ["status"])), clientProposalKpis(proposals));
    assert.deepEqual(agg.designKpis(designs), clientDesignKpis(designs));
    assert.deepEqual(agg.designKpis(grouped(designs, ["status"])), clientDesignKpis(designs));
  });

  test("engineer: issue stats, average progress, report counts", () => {
    assert.deepEqual(agg.issueStats(issuesRows), clientIssueStats(issuesRows));
    assert.deepEqual(agg.issueStats(grouped(issuesRows, ["status"])), clientIssueStats(issuesRows));
    assert.deepEqual(agg.issueStats([]), clientIssueStats([]));
    assert.equal(agg.averageProgress(projects), clientAverageProgress(projects));
    assert.equal(agg.averageProgress([]), clientAverageProgress([]));
    assert.deepEqual(agg.reportCounts(reports), clientReportCounts(reports));
    assert.deepEqual(agg.reportCounts(grouped(reports, ["type", "priority"])), clientReportCounts(reports));
  });

  test("owner: top actors", () => {
    assert.deepEqual(agg.topActors(auditActors), clientTopActors(auditActors));
  });

  test("IT designer: users by role and orphaned accounts", () => {
    const users = [{ role: "admin" }, { role: "engineer" }, { role: "engineer" }, { role: "ghost" }];
    const roles = [{ name: "admin", label: "Admin" }, { name: "engineer", label: "Engineer" }, { name: "owner", label: "Owner" }];
    assert.deepEqual(agg.usersByRole(users, roles), clientUsersByRole(users, roles));
    assert.deepEqual(agg.orphanedRoleUsers(users, roles), [{ role: "ghost" }]);
    assert.deepEqual(agg.orphanedRoleUsers(users, []), []);
  });

  test("HR: workforce snapshot", () => {
    const employees = [
      { employeeId: "E1", site: "North", status: "Active" },
      { employeeId: "E2", site: "North", status: "Active" },
      { employeeId: "E3", site: "South", status: "Active" },
      { employeeId: "E4", site: "South", status: "On Leave" },
      { employeeId: "E5", site: "South", status: "Active" },
    ];
    const recent = [
      { employeeId: "E1", hours: "9.0" }, { employeeId: "E1", hours: "8.0" }, { employeeId: "E3", hours: "8.0" },
      { employeeId: "E4", hours: null }, { employeeId: "GHOST", hours: "10" },
    ];
    // the server reduces attendance to one row per employee holding their longest shift
    const perEmployee = [
      { employeeId: "E1", hours: "9.0" }, { employeeId: "E3", hours: "8.0" }, { employeeId: "E4", hours: null }, { employeeId: "GHOST", hours: "10" },
    ];
    assert.deepEqual(agg.workforceSnapshot(employees, perEmployee), clientWorkforce(employees, recent));
  });

  test("PM workload: top 8 projects by open tasks, only the PM's own", () => {
    const tasks = [
      ...Array.from({ length: 3 }, () => ({ projectCode: "P-1", status: "Pending" })),
      { projectCode: "P-1", status: "In Progress" },
      { projectCode: "P-2", status: "Completed" },
      { projectCode: "P-3", status: "In Progress" },
      { projectCode: "OTHER", status: "Pending" },
    ];
    const out = agg.taskWorkload(grouped(tasks, ["projectCode", "status"]), ["P-1", "P-2", "P-3"]);
    assert.deepEqual(out, [
      { project: "P-1", pending: 3, inProgress: 1 },
      { project: "P-3", pending: 0, inProgress: 1 },
    ]);
    assert.deepEqual(agg.taskWorkload(tasks, ["P-1", "P-2", "P-3"]), out);
  });
});
