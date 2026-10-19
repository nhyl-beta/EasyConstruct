// apps/web/src/features/dashboard/hooks/useDashboardSummary.ts
//
// One request for a whole role dashboard: GET /api/dashboard/summary returns the
// totals and the few rows the dashboard draws (the server counts in SQL), where
// each dashboard used to download several full lists and count them here.
// The query is shared, so the dashboard and anything else reading the summary
// make a single request; writes refetch it (see lib/query-invalidation.ts).
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { apiClient } from "@/services/api.client";
import type { BackendProject } from "@/features/projects/repositories/project.repository";
import type { BackendEngineeringReport } from "@/features/engineering-reports/repositories/engineering-report.repository";
import type { AuditLog } from "@/features/audit-logs/types/audit-log.types";
import type { Proposal } from "@/features/proposals/types/proposal.types";
import type { Design } from "@/features/designs/types/design.types";

export interface ProjectsBlock {
  total: number;
  kpis: { total: number; onTrack: number; atRisk: number; delayed: number };
  overBudget: number;
  riskBreakdown: { high: number; medium: number; low: number };
  byPhase: { name: string; value: number }[];
  top: BackendProject[];
}

export interface ProposalKpis {
  total: number;
  pending: number;
  approved: number;
  revisionRequested: number;
}

export interface ExecutiveSummary {
  role: "owner" | "admin";
  projects: ProjectsBlock;
  workflows: { active: number; completed: number };
  approvals: { pending: number; overdue: number };
  proposals: { kpis: ProposalKpis };
  audit: { total: number; recent: AuditLog[]; topActors: { actor: string; count: number }[] };
}

export interface ProjectManagerSummary {
  role: "project-manager";
  projects: ProjectsBlock;
  workload: { project: string; pending: number; inProgress: number }[];
}

export interface ArchitectSummary {
  role: "architect";
  designs: { kpis: { total: number; inReview: number; approved: number; revisionNeeded: number }; recent: Design[] };
  proposals: { kpis: ProposalKpis };
}

export interface EngineerSummary {
  role: "engineer";
  assignedProjects: BackendProject[];
  assignedProjectCount: number;
  averageProgress: number;
  issues: { total: number; open: number; underReview: number; resolved: number; resolutionRate: number };
  reports: {
    total: number;
    progressCount: number;
    issueCount: number;
    criticalIssues: number;
    recent: BackendEngineeringReport[];
  };
  requirements: { total: number; pending: number };
}

export interface ConsultantSummary {
  role: "consultant";
  kpis: { pendingReviews: number; totalProposals: number; activeProjects: number; advisoryDocuments: number };
  proposalsAwaitingReviewCount: number;
  proposalsAwaitingReview: Proposal[];
  recentlyReviewed: Proposal[];
}

export interface ItDesignerSummary {
  role: "it-designer";
  users: {
    total: number;
    active: number;
    deactivated: number;
    byRole: { name: string; label: string; count: number }[];
    orphaned: { id: number; name: string; email: string; role: string; isActive: boolean }[];
  };
  roles: { count: number };
  audit: { total: number; sensitive: number; recent: AuditLog[]; accountEvents: AuditLog[] };
}

export interface HumanResourcesSummary {
  role: "human-resources";
  workforce: {
    headcount: number;
    active: number;
    windowDays: number;
    snapshot: {
      totalEmployees: number;
      totalCapacity: number;
      assignedRecently: number;
      available: number;
      overtimeCrews: number;
      sites: { site: string; capacity: number; assigned: number; available: number }[];
    };
  };
}

export interface FinanceSummary {
  role: "finance-manager";
  // Each section is null when it could not be computed; the rest still render.
  kpis: unknown | null;
  budgets: { project: string; planned: number | string }[] | null;
  expenses: unknown[] | null;
  cashFlow: unknown[] | null;
  projectProfit: unknown[] | null;
  approvals: { items: unknown[]; total: number } | null;
}

export interface SitePersonnelSummary {
  role: "site-personnel";
  attendanceToday: { clockIn: string; clockOut: string | null; geofence: string; logDate: string } | null;
  tasks: { total: number; pending: number; first: unknown[] };
  issues: { open: number };
  documents: { count: number };
}

export type DashboardSummary =
  | ExecutiveSummary
  | ProjectManagerSummary
  | ArchitectSummary
  | EngineerSummary
  | ConsultantSummary
  | ItDesignerSummary
  | HumanResourcesSummary
  | FinanceSummary
  | SitePersonnelSummary;

export async function fetchDashboardSummary<T extends DashboardSummary>(): Promise<T> {
  const json = (await apiClient.get("/dashboard/summary")) as { data: T };
  return json.data;
}

/** The caller's own dashboard summary; `role` on the result says which shape it is. */
export function useDashboardSummary<T extends DashboardSummary>() {
  const query = useQuery({
    queryKey: qk.dashboard.summary,
    queryFn: () => fetchDashboardSummary<T>(),
    staleTime: STALE.summary,
  });
  return {
    summary: query.data,
    loading: query.isPending,
    error: (query.error as Error | null) ?? null,
    reload: () => query.refetch(),
  };
}
