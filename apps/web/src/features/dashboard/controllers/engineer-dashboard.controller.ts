import { useMemo } from "react";

import { normalizeProject } from "@/features/projects/repositories/project.repository";
import { normalizeReport } from "@/features/engineering-reports/repositories/engineering-report.repository";
import { useDashboardSummary, type EngineerSummary } from "../hooks/useDashboardSummary";

// Composes the Engineer dashboard from the server's dashboard summary: the
// projects this engineer is staffed on (project_members), the field-issue
// stats scoped to them, report and requirement counts. One request.
export const useEngineerDashboardController = () => {
  const { summary, loading } = useDashboardSummary<EngineerSummary>();

  const assignedProjects = useMemo(() => (summary?.assignedProjects ?? []).map(normalizeProject), [summary]);
  const recentReports = useMemo(() => (summary?.reports.recent ?? []).map(normalizeReport), [summary]);

  return {
    loading,

    issues: summary?.issues ?? { total: 0, open: 0, underReview: 0, resolved: 0, resolutionRate: 100 },
    averageProgress: summary?.averageProgress ?? 0,

    assignedProjects,
    assignedProjectCount: summary?.assignedProjectCount ?? 0,

    reports: {
      total: summary?.reports.total ?? 0,
      progressCount: summary?.reports.progressCount ?? 0,
      issueCount: summary?.reports.issueCount ?? 0,
      criticalIssues: summary?.reports.criticalIssues ?? 0,
      // Newest five, ordered by the server.
      recent: recentReports,
    },

    requirements: summary?.requirements ?? { total: 0, pending: 0 },
  } as const;
};
