import { useState } from "react";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { NewWorkflowDialog } from "@/components/workflows/new-workflow-dialog";
import {
  useActiveWorkflows,
  useWorkflowTemplates,
} from "@/features/workflows/hooks/useWorkflows";
import { WorkflowFormatService } from "@/features/workflows/services/workflow.service";
import { WorkflowStagePipeline } from "@/components/workflows/workflow-stage-pipeline";
import { WorkflowDetailDialog } from "@/components/workflows/workflow-detail-dialog";
import { EditWorkflowDialog } from "@/components/workflows/edit-workflow-dialog";
import { useAuth } from "@/auth/auth-context";
import { FEATURES } from "@/config/features";
import { WorkflowRepository } from "@/features/workflows/repositories/workflow.repository";
import type { Workflow } from "@/features/workflows/types/workflow.types";
import {
  Eye,
  GitBranch,
  ListTree,
  Paperclip,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";

export default function WorkflowsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "it-designer";
  const { templates, loading: templatesLoading, creating, createWorkflow, error: workflowError, clearError } = useWorkflowTemplates();
  const { workflows, pagination, loading: workflowsLoading, update, remove } = useActiveWorkflows();
  const [dialogOpen, setDialogOpen] = useState(false);
  useOpenOnAction("new-workflow", () => setDialogOpen(true));
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  // Same dialog the Approvals page opens, so what a PM can see here before
  // signing off is exactly what they see there — these two views drifting
  // apart is what left the PM approving without the workflow's documents.
  const [detailWorkflowId, setDetailWorkflowId] = useState<number | null>(null);
  const [deletingWorkflow, setDeletingWorkflow] = useState<Workflow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [resubmittingStageId, setResubmittingStageId] = useState<number | null>(null);

  const resubmitStage = async (workflowId: number, stageId: number) => {
    setResubmittingStageId(stageId);
    try {
      // The write invalidates the workflow queries, so the list refetches itself.
      await WorkflowRepository.resubmitStage(workflowId, stageId);
    } finally {
      setResubmittingStageId(null);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Workflow builder"
        description="Configure how documents, approvals, and decisions flow across departments."
        actions={
          <Button
            onClick={() => {
              clearError();
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New workflow
          </Button>
        }
      />

      <Tabs defaultValue="active" className="space-y-5">
        <TabsList className="h-10">
          <TabsTrigger value="active">Active pipeline</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          {FEATURES.aiPlaceholders && <TabsTrigger value="ai">AI suggestions</TabsTrigger>}
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {workflowsLoading && (
            <p className="text-sm text-muted-foreground">Loading active workflows…</p>
          )}
          {!workflowsLoading && workflows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No active workflows. Use "New workflow" to initiate one.
            </p>
          )}
          {workflows.map((workflow) => {
            const canManage = isAdmin || workflow.createdBy === user?.name;
            return (
              <Card key={workflow.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {workflow.code} · {workflow.title}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {workflow.projectCode} · {WorkflowFormatService.amount(workflow.amount)} · {workflow.templateName ?? "—"}
                    </p>
                    {(workflow.attachments.length > 0 || workflow.lineItems.length > 0) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {workflow.attachments.length > 0 && (
                          <Badge variant="outline" className="rounded-full text-overline">
                            <Paperclip className="mr-1 h-3 w-3" />
                            {workflow.attachments.length} submitted{" "}
                            {workflow.attachments.length === 1 ? "item" : "items"}
                          </Badge>
                        )}
                        {workflow.lineItems.length > 0 && (
                          <Badge variant="outline" className="rounded-full text-overline">
                            <ListTree className="mr-1 h-3 w-3" />
                            {workflow.lineItems.length} cost{" "}
                            {workflow.lineItems.length === 1 ? "change" : "changes"}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setDetailWorkflowId(workflow.id)}
                    >
                      <Eye className="h-3.5 w-3.5" /> Documents & data
                    </Button>
                  {canManage && (
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Edit"
                        onClick={() => setEditingWorkflow(workflow)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive-strong hover:text-destructive-strong"
                        title="Delete"
                        onClick={() => setDeletingWorkflow(workflow)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <WorkflowStagePipeline stages={workflow.stages} />
                  {canManage &&
                    workflow.stages
                      .filter((stage) => stage.status === "revision-required")
                      .map((stage) => (
                        <div
                          key={stage.id}
                          className="flex items-center justify-between rounded-xl border border-warning/30 bg-warning/5 px-3 py-2 text-xs"
                        >
                          <span>
                            {stage.roleLabel} sent this back for revision
                            {stage.comments ? `: ${stage.comments}` : "."}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={resubmittingStageId === stage.id}
                            onClick={() => void resubmitStage(workflow.id, stage.id)}
                          >
                            <RotateCcw className="h-3 w-3" />
                            {resubmittingStageId === stage.id ? "Resubmitting…" : "Resubmit"}
                          </Button>
                        </div>
                      ))}
                </CardContent>
              </Card>
            );
          })}
          {pagination.total > 0 && <DataTablePagination {...pagination} />}
        </TabsContent>

        <TabsContent value="templates" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {templatesLoading && (
            <p className="text-sm text-muted-foreground">Loading templates…</p>
          )}
          {!templatesLoading && templates.length === 0 && (
            <p className="text-sm text-muted-foreground">No workflow templates configured yet.</p>
          )}
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                      <GitBranch className="h-4 w-4" />
                    </div>
                    <h3 className="font-medium leading-tight">{t.name}</h3>
                  </div>
                  <Badge variant="outline" className="rounded-full text-overline">
                    {t.activeCount} active
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{t.description}</p>
                <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
                  <span className="text-muted-foreground">
                    {t.defaultStages.length} stages · avg {WorkflowFormatService.avgDuration(t.avgDurationHours)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {FEATURES.aiPlaceholders && (
          <TabsContent value="ai">
            <Card className="border-ai/20 bg-linear-to-br from-ai-soft/60 to-card">
              <CardHeader>
                <Badge
                  variant="outline"
                  className="w-fit rounded-full border-ai/30 bg-ai/10 px-2.5 py-0.5 text-overline text-ai"
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  AI recommendation — human review required
                </Badge>
                <CardTitle className="text-base">Not yet connected</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                This panel will surface AI-suggested pipeline optimizations
                (e.g. "this template's Finance stage is rarely rejected —
                consider fast-tracking it") once a real AI endpoint exists for
                workflows. Nothing here is auto-applied — a PM must review and
                accept, edit, or dismiss each suggestion.
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <NewWorkflowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        templates={templates}
        creating={creating}
        error={workflowError}
        onSubmit={async (input) => {
          const created = await createWorkflow(input);
          return created;
        }}
      />

      <EditWorkflowDialog
        workflow={editingWorkflow}
        onOpenChange={(next) => {
          if (!next) setEditingWorkflow(null);
        }}
        onSave={(id, input) => update(id, input)}
      />

      <WorkflowDetailDialog
        workflowId={detailWorkflowId}
        onOpenChange={(next) => {
          if (!next) setDetailWorkflowId(null);
        }}
      />

      <ConfirmDialog
        open={deletingWorkflow !== null}
        onOpenChange={(next) => {
          if (!next) setDeletingWorkflow(null);
        }}
        title={`Delete workflow "${deletingWorkflow?.title ?? ""}"?`}
        description="This permanently deletes the workflow and its history. This cannot be undone."
        confirmLabel="Delete"
        loading={deletingBusy}
        onConfirm={async () => {
          if (!deletingWorkflow) return;
          setDeletingBusy(true);
          try {
            await remove(deletingWorkflow.id);
            setDeletingWorkflow(null);
          } finally {
            setDeletingBusy(false);
          }
        }}
      />
    </div>
  );
}