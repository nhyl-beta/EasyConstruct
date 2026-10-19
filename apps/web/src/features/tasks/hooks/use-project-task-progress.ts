// apps/web/src/features/tasks/hooks/use-project-task-progress.ts
import { useQuery } from "@tanstack/react-query";
import { STALE } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { apiClient } from "@/services/api.client";

export interface ProjectTaskProgress {
  projectCode: string;
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  percentComplete: number;
}

// Rollup of tasks grouped by project - computed by the server
// (GET /api/tasks/progress, one GROUP BY) instead of downloading every task
// to count them here. Deliberately does not write back to `projects.progress`
// (a separate, manually-set column); it is a read-only view of what Site
// Personnel have actually completed.
export function useProjectTaskProgress() {
  const query = useQuery({
    queryKey: [...qk.tasks.all, "progress"],
    queryFn: async () => {
      const json = await apiClient.get("/tasks/progress");
      return (json?.data ?? []) as ProjectTaskProgress[];
    },
    staleTime: STALE.list,
  });

  return {
    byProject: query.data ?? [],
    loading: query.isPending,
    error: query.error ? (query.error instanceof Error ? query.error.message : "Failed to load tasks") : null,
    refresh: () => query.refetch(),
  };
}
