import { useDashboardSummary, type ItDesignerSummary } from "../hooks/useDashboardSummary";

// IT Designer's dashboard answers "is the system healthy and who is in it", not
// "how are the projects going" - so it reads users, roles and the audit trail,
// and touches no project, finance or workflow data. The server counts them.
export const useITDesignerDashboardController = () => {
  const { summary, loading, error } = useDashboardSummary<ItDesignerSummary>();

  return {
    loading,

    usersLoading: loading,
    usersError: error,
    totalUserCount: summary?.users.total ?? 0,
    activeUserCount: summary?.users.active ?? 0,
    deactivatedUserCount: summary?.users.deactivated ?? 0,
    usersByRole: summary?.users.byRole ?? [],
    orphanedRoleUsers: summary?.users.orphaned ?? [],

    rolesLoading: loading,
    rolesError: error,
    roleCount: summary?.roles.count ?? 0,

    auditLogsLoading: loading,
    auditLogsError: error,
    auditEventCount: summary?.audit.total ?? 0,
    sensitiveEventCount: summary?.audit.sensitive ?? 0,
    accountEvents: summary?.audit.accountEvents ?? [],
    recentActivity: summary?.audit.recent ?? [],
  } as const;
};

export default useITDesignerDashboardController;
