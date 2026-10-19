import { Button } from "@/components/ui/button";

import { ProjectEmptyState } from "@/features/projects/components/ProjectEmptyState";
import { ProjectLoadingState } from "@/features/projects/components/ProjectLoadingState";
import { ProjectsFilters } from "@/features/projects/components/ProjectsFilters";
import { ProjectsGrid } from "@/features/projects/components/ProjectsGrid";
import { ProjectsHeader } from "@/features/projects/components/ProjectsHeader";
import { ProjectsKpiStrip } from "@/features/projects/components/ProjectsKpiStrip";
import { ProjectsPagination } from "@/features/projects/components/ProjectsPagination";
import { ProjectsTable } from "@/features/projects/components/ProjectsTable";
import { ProjectsToolbar } from "@/features/projects/components/ProjectsToolbar";
import { useProjectsPaged } from "@/features/projects/hooks/useProjectsPaged";
import { useAuth } from "@/auth/auth-context";

import { Plus } from "lucide-react";
import { useNavigate } from "react-router";

export default function AdminProjectsPage() {
  const ctrl = useProjectsPaged();
  const navigate = useNavigate();
  const { user } = useAuth();
  // IT Designer sees this page read-only (server rejects its writes too).
  const canCreate = user?.role === "admin";

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <ProjectsHeader
        subtitle={`Organization-wide oversight of ${ctrl.kpis.total} project${ctrl.kpis.total === 1 ? "" : "s"}`}
        actions={
          canCreate ? (
            <Button onClick={() => navigate("/projects/new")}>
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          ) : undefined
        }
      />

      <ProjectsKpiStrip kpis={ctrl.kpis} />

      <ProjectsToolbar
        query={ctrl.query}
        setQuery={ctrl.setQuery}
        view={ctrl.view}
        setView={ctrl.setView}
        showCreate={false}
        filters={
          <ProjectsFilters
            filters={ctrl.filters}
            onChange={ctrl.setFilter}
            onClear={ctrl.clearFilters}
            active={ctrl.hasActiveFilters}
          />
        }
      />

      {ctrl.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
          Couldn't load projects. {ctrl.error.message}
        </div>
      ) : ctrl.loading && ctrl.projects.length === 0 ? (
        <ProjectLoadingState />
      ) : ctrl.projects.length === 0 ? (
        <ProjectEmptyState />
      ) : (
        <div className={ctrl.loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
          {ctrl.view === "table" ? (
            <ProjectsTable projects={ctrl.projects} />
          ) : (
            <ProjectsGrid projects={ctrl.projects} />
          )}
        </div>
      )}

      {!ctrl.error && ctrl.total > 0 && (
        <ProjectsPagination
          page={ctrl.page}
          pages={ctrl.pages}
          pageSize={ctrl.pageSize}
          total={ctrl.total}
          onPage={ctrl.setPage}
          onPageSize={ctrl.setPageSize}
        />
      )}
    </div>
  );
}

AdminProjectsPage.displayName = "AdminProjectsPage";
