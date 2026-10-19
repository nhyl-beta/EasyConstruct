import { useMemo } from "react";

import { usePayrollSummary } from "@/features/payroll-summary/hooks/usePayrollSummary";
import { normalizeProject } from "@/features/projects/repositories/project.repository";
import { useDashboardSummary, type ExecutiveSummary } from "../hooks/useDashboardSummary";

// Owner is read-only, so this is the Admin controller's org-wide picture minus
// everything Admin uses to act on it. Every number comes from the server's
// dashboard summary (one request); the payroll aggregate keeps its own
// endpoint, /api/payroll/owner-summary, which only owner, admin and
// it-designer may call.
export const useOwnerDashboardController = () => {
  const { summary, loading, error } = useDashboardSummary<ExecutiveSummary>();
  const payroll = usePayrollSummary();

  const topProjects = useMemo(() => (summary?.projects.top ?? []).map(normalizeProject), [summary]);
  const recentActivity = useMemo(() => (summary?.audit.recent ?? []).slice(0, 8), [summary]);

  return {
    loading,

    projectsLoading: loading,
    projectsError: error,
    kpis: summary?.projects.kpis ?? { total: 0, onTrack: 0, atRisk: 0, delayed: 0 },
    overBudget: summary?.projects.overBudget ?? 0,
    totalProjectCount: summary?.projects.total ?? 0,
    topProjects,

    workflowsLoading: loading,
    activeWorkflowCount: summary?.workflows.active ?? 0,
    completedWorkflowCount: summary?.workflows.completed ?? 0,

    approvalsLoading: loading,
    pendingApprovals: summary?.approvals.pending ?? 0,
    overdueApprovals: summary?.approvals.overdue ?? 0,

    auditLogsLoading: loading,
    auditLogsError: error,
    auditEventCount: summary?.audit.total ?? 0,
    recentActivity,
    topActors: summary?.audit.topActors ?? [],

    proposalsLoading: loading,
    proposalsKpis: summary?.proposals.kpis ?? { total: 0, pending: 0, approved: 0, revisionRequested: 0 },

    payrollLoading: payroll.loading,
    payrollError: payroll.error,
    payrollSummary: payroll.summary,
  } as const;
};

export default useOwnerDashboardController;
