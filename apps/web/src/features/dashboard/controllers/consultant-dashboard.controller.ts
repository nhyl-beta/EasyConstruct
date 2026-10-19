import { useDashboardSummary, type ConsultantSummary } from "../hooks/useDashboardSummary";

export const useConsultantDashboardController = () => {
  const { summary, loading } = useDashboardSummary<ConsultantSummary>();

  return {
    loading,

    kpis: {
      pendingReviews: summary?.kpis.pendingReviews ?? 0,
      totalProposals: summary?.kpis.totalProposals ?? 0,
      activeProjects: summary?.kpis.activeProjects ?? 0,
      advisoryDocuments: summary?.kpis.advisoryDocuments ?? 0,
    },

    /** How many proposals are waiting on this consultant (the table shows the first five). */
    proposalsAwaitingReviewCount: summary?.proposalsAwaitingReviewCount ?? 0,
    proposalsAwaitingReview: summary?.proposalsAwaitingReview ?? [],
    recentlyReviewed: summary?.recentlyReviewed ?? [],

    approvals: {
      available: false,
    },
  } as const;
};

export default useConsultantDashboardController;
