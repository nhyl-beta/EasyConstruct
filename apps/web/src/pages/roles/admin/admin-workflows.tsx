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
import { WorkflowStagePipeline } from "@/components/workflows/workflow-stage-pipeline";
import { WorkflowDetailDialog } from "@/components/workflows/workflow-detail-dialog";
import { ApprovalQueuePanel } from "@/components/workflows/approval-queue-panel";
import { EditWorkflowDialog } from "@/components/workflows/edit-workflow-dialog";
import {
  useActiveWorkflows,
  useWorkflowTemplates,
} from "@/features/workflows/hooks/useWorkflows";
import { WorkflowFormatService } from "@/features/workflows/services/workflow.service";
import type { Workflow, WorkflowTemplate } from "@/features/workflows/types/workflow.types";
import {
  CheckSquare,
  Eye,
  GitBranch,
  ListTree,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";

export default function AdminWorkflowsPage() {
  const { user } = useAuth();
  // IT Designer's workflow scope is read-only — the server already rejects
  // create/update/delete for this role (apps/api/src/workflows/routes.ts); the
  // actions are hidden here too instead of leaving buttons that always 403.
  const canManage = user?.role !== "it-designer";
  const {
    templates,
    loading: templatesLoading,
    error: templatesError,
    creating,
    createWorkflow,
    deletingTemplateId,
    deleteTemplate,
    clearError,
  } = useWorkflowTemplates();
  const { workflows, pagination, loading: workflowsLoading, update, remove } = useActiveWorkflows();
  const [dialogOpen, setDialogOpen] = useState(false);
  useOpenOnAction("new-workflow", () => setDialogOpen(true));
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  // Admin decides LAST on most chains, so it is the role with the most prior
  // stages to read — the same detail dialog every other approver now opens.
  const [detailWorkflowId, setDetailWorkflowId] = useState<number | null>(null);
  const [deletingWorkflow, setDeletingWorkflow] = useState<Workflow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<WorkflowTemplate | null>(null);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Workflow oversight"
        description="Initiate approval, document routing, and coordination workflows, then monitor them through to completion across every role."
        actions={
          canManage && (
            <Button
              onClick={() => {
                clearError();
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New workflow
            </Button>
          )
        }
      />

      <Tabs defaultValue="approvals" className="space-y-5">
        <TabsList className="h-10">
          <TabsTrigger value="approvals">
            <CheckSquare className="h-3.5 w-3.5" /> Approvals
          </TabsTrigger>
          <TabsTrigger value="active">Active pipeline</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="approvals">
          <ApprovalQueuePanel
            emptyPendingMessage="Nothing pending across the organization."
            showInitiationActions={false}
          />
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          {workflowsLoading && (
            <p className="text-sm text-muted-foreground">Loading active workflows…</p>
          )}
          {!workflowsLoading && workflows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No active workflows. Use "New workflow" to initiate one.
            </p>
          )}
          {workflows.map((workflow) => (
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
                    <>
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
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <WorkflowStagePipeline stages={workflow.stages} />
              </CardContent>
            </Card>
          ))}
          {pagination.total > 0 && <DataTablePagination {...pagination} />}
        </TabsContent>

        <TabsContent value="templates" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {templatesLoading && (
            <p className="text-sm text-muted-foreground">Loading templates…</p>
          )}
          {!templatesLoading && templatesError && (
            <p className="text-sm text-destructive-strong">{templatesError.message}</p>
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
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="rounded-full text-overline">
                      {t.activeCount} active
                    </Badge>
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive-strong hover:text-destructive-strong"
                        title="Delete template"
                        onClick={() => setDeletingTemplate(t)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
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
      </Tabs>

      <NewWorkflowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        templates={templates}
        creating={creating}
        error={templatesError}
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

      <ConfirmDialog
        open={deletingTemplate !== null}
        onOpenChange={(next) => {
          if (!next) setDeletingTemplate(null);
        }}
        title={`Delete "${deletingTemplate?.name ?? ""}"?`}
        description="This cannot be undone. Blocked if any workflow — active or completed — was ever raised from this template."
        confirmLabel="Delete"
        loading={deletingTemplateId === deletingTemplate?.id}
        onConfirm={async () => {
          if (!deletingTemplate) return;
          await deleteTemplate(deletingTemplate.id);
          setDeletingTemplate(null);
        }}
      />
    </div>
  );
}

AdminWorkflowsPage.displayName = "AdminWorkflowsPage";
