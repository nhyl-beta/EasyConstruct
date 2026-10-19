import { ProjectLoadingState } from "@/features/projects/components/ProjectLoadingState";
import { ProjectsGrid } from "@/features/projects/components/ProjectsGrid";
import { ProjectsHeader } from "@/features/projects/components/ProjectsHeader";
import { ProjectsKpiStrip } from "@/features/projects/components/ProjectsKpiStrip";
import { ProjectsTable } from "@/features/projects/components/ProjectsTable";
import { ProjectsToolbar } from "@/features/projects/components/ProjectsToolbar";
import { useProjectsPaged } from "@/features/projects/hooks/useProjectsPaged";
import { ProjectsPagination } from "@/features/projects/components/ProjectsPagination";

// The same shared project components Admin's projects page is built from,
// with no `actions` slot: Owner has no create/edit grant on /api/projects, so
// offering a "New Project" button here would only ever produce a 403.
export default function OwnerPortfolioPage() {
  const ctrl = useProjectsPaged({ kpis: "filtered", archivedToggle: true, completedToggle: true });

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <ProjectsHeader
        subtitle={`Executive view of ${ctrl.kpis.total} project${ctrl.kpis.total === 1 ? "" : "s"} across the organization`}
      />

      <ProjectsKpiStrip kpis={ctrl.kpis} />

      <ProjectsToolbar
        query={ctrl.query}
        setQuery={ctrl.setQuery}
        view={ctrl.view}
        setView={ctrl.setView}
        showCreate={false}
        showArchived={ctrl.showArchived}
        onToggleArchived={ctrl.setShowArchived}
        completedOnly={ctrl.completedOnly}
        onToggleCompletedOnly={ctrl.setCompletedOnly}
      />

      {ctrl.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
          Couldn't load projects. {ctrl.error.message}
        </div>
      ) : ctrl.loading && ctrl.projects.length === 0 ? (
        <ProjectLoadingState />
      ) : ctrl.projects.length === 0 ? (
        // Not the shared ProjectEmptyState: its call to action is "Create
        // project", which Owner cannot do.
        <div className="rounded-xl border border-dashed border-border bg-muted/50 px-6 py-12 text-center text-sm text-muted-foreground">
          No projects match this view.
        </div>
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

OwnerPortfolioPage.displayName = "OwnerPortfolioPage";
