import { useMemo } from "react";
import { normalizeProject } from "@/features/projects/repositories/project.repository";
import { useNotifications } from "@/features/notifications/hooks/useNotifications";
import { useDashboardSummary, type ExecutiveSummary } from "../hooks/useDashboardSummary";

// Admin's org-wide picture. The totals and the few rows drawn come from one
// GET /api/dashboard/summary (counted by the server); notifications keep their
// own live hook, exactly as before.
export const useAdminDashboardController = () => {
  const { summary, loading: summaryLoading, error } = useDashboardSummary<ExecutiveSummary>();
  const notifications = useNotifications();

  const topProjects = useMemo(() => (summary?.projects.top ?? []).map(normalizeProject), [summary]);

  const unreadNotificationCount = useMemo(
    () => notifications.notifications.filter((n) => !n.isRead).length,
    [notifications.notifications],
  );

  const recentNotifications = useMemo(
    () => notifications.notifications.slice(0, 6),
    [notifications.notifications],
  );

  const recentActivity = useMemo(() => (summary?.audit.recent ?? []).slice(0, 6), [summary]);

  return {
    loading: summaryLoading,
    projectsLoading: summaryLoading,
    projectsError: error,
    kpis: summary?.projects.kpis ?? { total: 0, onTrack: 0, atRisk: 0, delayed: 0 },
    overBudget: summary?.projects.overBudget ?? 0,
    topProjects,
    totalProjectCount: summary?.projects.total ?? 0,

    workflowsLoading: summaryLoading,
    workflowsError: error,
    activeWorkflowCount: summary?.workflows.active ?? 0,
    completedWorkflowCount: summary?.workflows.completed ?? 0,

    approvalsLoading: summaryLoading,
    pendingApprovals: summary?.approvals.pending ?? 0,
    overdueApprovals: summary?.approvals.overdue ?? 0,

    notificationsLoading: notifications.loading,
    unreadNotificationCount,
    recentNotifications,

    auditLogsLoading: summaryLoading,
    recentActivity,

    proposalsLoading: summaryLoading,
    proposalsKpis: summary?.proposals.kpis ?? { total: 0, pending: 0, approved: 0, revisionRequested: 0 },
  };
};
