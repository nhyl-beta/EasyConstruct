import { useMemo } from "react";
import { normalizeProject } from "@/features/projects/repositories/project.repository";
import { useDashboardSummary, type ProjectManagerSummary } from "../hooks/useDashboardSummary";

export const usePmDashboardController = () => {
  const { summary, loading, error } = useDashboardSummary<ProjectManagerSummary>();

  // Attention order (risk, then budget) and every count are computed by the
  // server over the PM's own non-archived projects.
  const topProjects = useMemo(() => (summary?.projects.top ?? []).map(normalizeProject), [summary]);

  return {
    loading,
    error,
    kpis: summary?.projects.kpis ?? { total: 0, onTrack: 0, atRisk: 0, delayed: 0 },
    riskBreakdown: summary?.projects.riskBreakdown ?? { high: 0, medium: 0, low: 0 },
    overBudget: summary?.projects.overBudget ?? 0,
    topProjects,
    totalProjectCount: summary?.projects.total ?? 0,
    /** Portfolio split by lifecycle phase, biggest first (drives the "Projects by phase" chart). */
    phases: summary?.projects.byPhase ?? [],
    /** Open tasks per project, top 8 (drives the "Open workload" chart). */
    workload: summary?.workload ?? [],
  };
};
