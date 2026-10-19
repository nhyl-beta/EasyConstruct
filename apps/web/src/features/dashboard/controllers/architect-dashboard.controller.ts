import { useDashboardSummary, type ArchitectSummary } from "../hooks/useDashboardSummary";

export const useArchitectDashboardController = () => {
  const { summary, loading } = useDashboardSummary<ArchitectSummary>();

  return {
    loading,
    kpis: summary?.designs.kpis ?? { total: 0, inReview: 0, approved: 0, revisionNeeded: 0 },
    proposalKpis: summary?.proposals.kpis ?? { total: 0, pending: 0, approved: 0, revisionRequested: 0 },
    // The five newest designs among the architect's assigned projects.
    recentDesigns: summary?.designs.recent ?? [],
  };
};
