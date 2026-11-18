import { useState } from "react";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { WorkflowDetailDialog } from "@/components/workflows/workflow-detail-dialog";
import { useCompletedWorkflows } from "@/features/workflows/hooks/useWorkflows";
import { WorkflowFormatService } from "@/features/workflows/services/workflow.service";
import { Eye } from "lucide-react";

/** Read-only list of the workflows the dashboard "Completed workflows" card counts (every project, every type). */
export default function CompletedWorkflowsPage() {
  const { workflows, pagination, loading } = useCompletedWorkflows();
  const [detailId, setDetailId] = useState<number | null>(null);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Completed workflows"
        description={`Every workflow that finished its approval chain, across all projects. The dashboard card counts these: ${pagination.total} in total.`}
      />
      {loading && <p className="text-sm text-muted-foreground">Loading completed workflows…</p>}
      {!loading && workflows.length === 0 && (
        <p className="text-sm text-muted-foreground">No workflow has been completed yet.</p>
      )}
      {workflows.map((w) => (
        <Card key={w.id}>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {w.code} · {w.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {w.projectCode} · {WorkflowFormatService.amount(w.amount)} · {w.templateName ?? "—"}
                {w.updatedAt ? ` · completed ${new Date(w.updatedAt).toLocaleDateString()}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="h-8 shrink-0 text-xs" onClick={() => setDetailId(w.id)}>
              <Eye className="h-3.5 w-3.5" /> Documents & data
            </Button>
          </CardHeader>
        </Card>
      ))}
      {pagination.total > 0 && <DataTablePagination {...pagination} />}
      <WorkflowDetailDialog workflowId={detailId} onOpenChange={(next) => !next && setDetailId(null)} />
    </div>
  );
}
