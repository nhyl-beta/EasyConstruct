import { useState } from "react";
import { GitBranch, Info, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { NewWorkflowTemplateDialog } from "@/components/workflows/new-workflow-template-dialog";
import { WORKFLOW_STAGE_ICONS } from "@/components/workflows/workflow-stage-pipeline";
import { useWorkflowTemplates } from "@/features/workflows/hooks/useWorkflows";
import { WorkflowFormatService } from "@/features/workflows/services/workflow.service";
import { useAuth } from "@/auth/auth-context";
import type { WorkflowTemplate } from "@/features/workflows/types/workflow.types";

export default function AdminWorkflowConfigurationPage() {
  const { user } = useAuth();
  // IT Designer's workflow scope is read-only — the server already rejects
  // POST/DELETE /workflows/templates for this role (apps/api/src/workflows/routes.ts).
  const canManage = user?.role !== "it-designer";
  const {
    templates,
    loading,
    error,
    creatingTemplate,
    createTemplate,
    deletingTemplateId,
    deleteTemplate,
  } = useWorkflowTemplates();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState<WorkflowTemplate | null>(null);

  return (
    <PageContainer>
      <PageHeader
        title="Workflow configuration"
        description={
          canManage
            ? "Define custom workflow templates — the stage sequence each one runs through — and see every template available for initiation."
            : "The stage sequence each workflow template runs through. Read-only for this role."
        }
        actions={
          canManage ? (
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              New template
            </Button>
          ) : undefined
        }
      />
      <PageContent className="space-y-4 p-6 md:p-8">
        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Templates define the stage/role sequence new workflows are
            created from. A template built here is usable everywhere a
            seeded one is — from the Workflows page, and from every role's
            own "start a workflow" action — the moment it's created.
          </p>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading templates…</p>}
        {!loading && error && (
          <p className="text-sm text-destructive-strong">{error.message}</p>
        )}
        {!loading && !error && templates.length === 0 && (
          <p className="text-sm text-muted-foreground">No workflow templates configured yet.</p>
        )}

        <div className="space-y-4">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <GitBranch className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="rounded-full text-overline">
                    {t.activeCount} active · avg {WorkflowFormatService.avgDuration(t.avgDurationHours)}
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
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  {t.defaultStages.map((stage, i) => {
                    // Each stage shows the icon of its step type, same map
                    // the live pipeline uses.
                    const StageIcon = WORKFLOW_STAGE_ICONS[stage.iconKey ?? ""];
                    return (
                    <span key={`${t.id}-${i}-${stage.role}`} className="flex items-center gap-2">
                      <Badge variant="outline" className="gap-1.5 rounded-full px-2.5 py-1 text-overline">
                        {StageIcon && <StageIcon className="h-3 w-3" />}
                        {i + 1}. {stage.roleLabel}
                      </Badge>
                      {i < t.defaultStages.length - 1 && (
                        <span className="text-muted-foreground">→</span>
                      )}
                    </span>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageContent>

      <NewWorkflowTemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        creating={creatingTemplate}
        onSubmit={createTemplate}
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
          // Closed either way — a rejection (e.g. workflows still reference
          // it) surfaces in the page-level error banner above the list,
          // which ConfirmDialog has no room to show inline.
          await deleteTemplate(deletingTemplate.id);
          setDeletingTemplate(null);
        }}
      />
    </PageContainer>
  );
}

AdminWorkflowConfigurationPage.displayName = "AdminWorkflowConfigurationPage";
