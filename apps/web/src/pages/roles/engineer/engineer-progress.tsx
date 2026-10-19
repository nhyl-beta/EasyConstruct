import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useState } from "react";
import { ClipboardList, FileSearch, FolderKanban, ShieldCheck } from "lucide-react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Progress } from "@/components/ui/progress";

import { useEngineeringReports } from "@/features/engineering-reports/hooks/useEngineeringReport";
import { PROGRESS_REPORT_TYPES } from "@/features/engineering-reports/types/engineering-reports.types";
import { useProjectTaskProgress } from "@/features/tasks/hooks/use-project-task-progress";
import { NewReportDialog, ReportDetailDialog, ReportStatusBadge } from "@/pages/roles/shared/shared-engineer";
import type { EngineeringReport } from "@/features/engineering-reports/types/engineering-reports.types";
import { useAuth } from "@/auth/auth-context";
import { EngineerMilestonesCard } from "@/features/milestones/components/EngineerMilestonesCard";

export default function ProgressPage() {
  const { user } = useAuth();
  const { reports, loading, createReport, counts, pagination } = useEngineeringReports("progress");
  const { byProject, loading: taskProgressLoading } = useProjectTaskProgress();
  const [selected, setSelected] = useState<EngineeringReport | null>(null);

  const openInspections = counts.byTypeAndNotStatus("Site Inspection", "Approved");
  const technicalReviews = counts.byType("Technical Report");
  const underReview = counts.byStatus("Under Review");

  return (
    <PageContainer>
      <PageHeader
        title="Progress"
        description="Track construction progress and site reports"
        actions={
          <NewReportDialog
            typeOptions={PROGRESS_REPORT_TYPES}
            createReport={createReport}
            engineerName={user?.name ?? "Unknown"}
          />
        }
      />
      <PageContent className="space-y-6 p-6 md:p-8">
        <KpiStrip
          items={[
            {
              label: "Site reports",
              value: loading ? "…" : `${counts.total}`,
              icon: ClipboardList,
              hint: "progress-related reports",
            },
            {
              label: "Open inspections",
              value: loading ? "…" : `${openInspections}`,
              icon: ShieldCheck,
              tone: openInspections > 0 ? "warn" : "neutral",
              hint: "not yet approved",
            },
            {
              label: "Technical reports",
              value: loading ? "…" : `${technicalReviews}`,
              icon: FileSearch,
              hint: "on file",
            },
            {
              label: "Under review",
              value: loading ? "…" : `${underReview}`,
              icon: FileSearch,
              tone: underReview > 0 ? "warn" : "neutral",
              hint: "awaiting sign-off",
            },
          ]}
        />

        <EngineerMilestonesCard />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Project task progress</CardTitle>
            <p className="text-xs text-muted-foreground">
              Live rollup of Site Personnel's task updates, grouped by project.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {taskProgressLoading ? (
              <div className="p-5 text-sm text-muted-foreground">Loading task progress…</div>
            ) : byProject.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">
                No tasks recorded against any project yet.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {byProject.map((p) => (
                  <div key={p.projectCode} className="flex items-center justify-between gap-4 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                        <FolderKanban className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{p.projectCode}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.completed} done · {p.inProgress} in progress · {p.pending} pending
                        </div>
                      </div>
                    </div>
                    <div className="flex w-40 shrink-0 items-center gap-2">
                      <Progress value={p.percentComplete} className="h-1.5" />
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                        {p.percentComplete}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent site reports</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 text-sm text-muted-foreground">Loading reports…</div>
            ) : reports.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">
                No progress reports yet — file one with "New report".
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {reports.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelected(r)}
                    className="flex w-full items-center justify-between gap-4 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-muted-foreground">
                        {r.id} · {r.type}
                      </div>
                      <div className="truncate text-sm font-medium">
                        {r.project} · {r.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.engineer} · {r.location} · {r.updatedAgo}
                      </div>
                    </div>
                    <ReportStatusBadge status={r.status} />
                  </button>
                ))}
              </div>
            )}
            {!loading && reports.length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <DataTablePagination {...pagination} />
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>
      <ReportDetailDialog report={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </PageContainer>
  );
}

ProgressPage.displayName = "ProgressPage";