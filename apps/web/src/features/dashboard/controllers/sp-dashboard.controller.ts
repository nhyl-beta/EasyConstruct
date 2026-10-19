import { useDashboardSummary, type SitePersonnelSummary } from "../hooks/useDashboardSummary";

interface DashboardTask {
  id: number;
  title: string;
  status: string;
}

// Site Personnel's own day: today's attendance record, how many tasks are
// assigned / pending (and the first few), open issues they reported, and the
// field-document count. One request instead of attendance + tasks + issues +
// documents + a separate "who am I" lookup.
export const useSpDashboardController = () => {
  const { summary, loading } = useDashboardSummary<SitePersonnelSummary>();

  return {
    loading,
    today: summary?.attendanceToday ?? null,
    taskCounts: { total: summary?.tasks.total ?? 0, pending: summary?.tasks.pending ?? 0 },
    tasks: (summary?.tasks.first ?? []) as DashboardTask[],
    openIssues: summary?.issues.open ?? 0,
    documentCount: summary?.documents.count ?? 0,
  } as const;
};
