import { useState } from "react";
import { useServerList } from "@/hooks/use-server-list";
import { qk } from "@/lib/query-keys";
import { ProjectRepository } from "../repositories/project.repository";
import type { Project, ProjectsKpi } from "../types/project.types";

export const PAGE_SIZES = [10, 20, 50] as const;

export interface ProjectFilterState {
  projectType: string;
  deliveryType: string;
  status: string;
  risk: string;
}

const NO_FILTERS: ProjectFilterState = { projectType: "all", deliveryType: "all", status: "all", risk: "all" };
const NO_KPIS: ProjectsKpi = { total: 0, onTrack: 0, atRisk: 0, delayed: 0 };

interface Options {
  /**
   * Which headline counts the strip shows: the whole portfolio regardless of
   * search and filters ("portfolio", the All-projects table), or exactly the
   * rows the search / toggles select ("filtered", the PM and Owner pages).
   */
  kpis?: "portfolio" | "filtered";
  /** Offer the "Show archived" toggle (archived projects are hidden by default). */
  archivedToggle?: boolean;
  /** Offer the "Completed only" toggle (Owner's portfolio). */
  completedToggle?: boolean;
}

/**
 * A projects table backed by the server: search (debounced), filters, page and
 * page size go to GET /api/projects as page / limit / search / filters, the
 * previous page stays on screen while the next one loads, and the headline
 * counts come back in the response's `meta.kpis` - no full list is downloaded.
 */
export function useProjectsPaged({ kpis = "portfolio", archivedToggle = false, completedToggle = false }: Options = {}) {
  const [filters, setFilters] = useState<ProjectFilterState>(NO_FILTERS);
  const [view, setView] = useState<"table" | "grid">("table");
  const [showArchived, setShowArchived] = useState(false);
  const [completedOnly, setCompletedOnly] = useState(false);

  const list = useServerList<Project, ProjectsKpi | undefined>({
    key: (params) => qk.projects.list({ ...params, kpis, archivedToggle }),
    fetchPage: async (params) => {
      const page = await ProjectRepository.listPage({
        page: params.page,
        pageSize: params.limit,
        search: params.search,
        projectType: filters.projectType,
        deliveryType: filters.deliveryType,
        risk: filters.risk,
        status: completedOnly ? "Completed" : filters.status,
        // Archived is the terminal phase: hidden unless asked for (or filtered to explicitly).
        excludeArchived: archivedToggle ? !showArchived && filters.status !== "Archived" : filters.status !== "Archived",
        kpis,
      });
      return { items: page.items, total: page.total, pages: page.pages, extra: page.kpis };
    },
    filters: { ...filters, showArchived, completedOnly },
    initialPageSize: PAGE_SIZES[0],
  });

  const setFilter = (key: keyof ProjectFilterState, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const clearFilters = () => {
    setFilters(NO_FILTERS);
    list.setSearchInput("");
  };

  const hasActiveFilters =
    list.searchInput.trim() !== "" || Object.values(filters).some((v) => v !== "all");

  return {
    projects: list.pageItems,
    total: list.total,
    pages: list.pageCount,
    page: list.currentPage,
    pageSize: list.pageSize,
    setPage: list.setCurrentPage,
    setPageSize: list.setPageSize,
    query: list.searchInput,
    setQuery: list.setSearchInput,
    filters,
    setFilter,
    clearFilters,
    hasActiveFilters,
    view,
    setView,
    showArchived: archivedToggle ? showArchived : false,
    setShowArchived,
    completedOnly: completedToggle ? completedOnly : false,
    setCompletedOnly,
    kpis: list.extra ?? NO_KPIS,
    /** A request is in flight (also while the previous page is still shown). */
    loading: list.fetching,
    error: list.error,
  } as const;
}
