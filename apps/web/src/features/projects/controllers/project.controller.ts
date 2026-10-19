import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { ProjectRepository } from "../repositories/project.repository";
import { ProjectService } from "../services/project.service";

/**
 * Every non-archived project the caller may see, as one shared, cached query:
 * the lookups behind pickers and dropdowns (project selectors, the quick-search
 * palette, budget and workflow dialogs). Fetched 100 per request, so a typical
 * portfolio is a single small request, made once and reused by all of them.
 * Tables do not use this: they page through useProjectsPaged.
 */
export function useProjectsController() {
  const query = useQuery({
    queryKey: qk.projects.list({ lookup: "all-active" }),
    queryFn: () => ProjectRepository.listAll({ excludeArchived: true }),
    staleTime: STALE.list,
  });
  const projects = query.data ?? [];

  return {
    projects,
    loading: query.isLoading,
    error: (query.error as Error | null) ?? null,
    kpis: ProjectService.calcKpis(projects),
    reload: () => query.refetch(),
  } as const;
}
