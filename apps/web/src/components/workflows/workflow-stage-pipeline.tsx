// src/components/workflows/workflow-stage-pipeline.tsx
// Shared read-only rendering of a workflow's stage pipeline — extracted from
// pm-workflows.tsx's "Active pipeline" tab so the Approvals page (EC-005)
// can reuse the exact same view instead of building a second one.
import { formatRelativeTime } from "@/lib/format-relative-time";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  FileSignature,
  ShieldCheck,
  UserCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { WorkflowStage } from "@/features/workflows/types/workflow.types";

export const WORKFLOW_STAGE_ICONS: Record<string, LucideIcon> = {
  UserCheck,
  Wallet,
  ShieldCheck,
  FileSignature,
};

interface WorkflowStagePipelineProps {
  stages: WorkflowStage[];
  /** Vertical layout reads better inside a narrow dialog than the
   * horizontal one used on the full-width Workflows page. */
  direction?: "row" | "column";
}

export function WorkflowStagePipeline({ stages, direction = "row" }: WorkflowStagePipelineProps) {
  return (
    <div
      className={
        direction === "row"
          ? "flex flex-col gap-3 md:flex-row md:items-stretch"
          : "flex flex-col gap-3"
      }
    >
      {stages.map((stage, i) => {
        const Icon = WORKFLOW_STAGE_ICONS[stage.iconKey] ?? UserCheck;
        return (
          <div key={stage.id} className="flex flex-1 items-start gap-3">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 ${
                stage.status === "done"
                  ? "border-success bg-success/10 text-success-strong"
                  : stage.status === "current"
                  ? "border-primary bg-primary/10 text-primary-strong"
                  : stage.status === "rejected"
                  ? "border-destructive bg-destructive/10 text-destructive-strong"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{stage.roleLabel}</span>
                {stage.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-success-strong" />}
                {stage.status === "current" && <Clock className="h-3.5 w-3.5 text-primary-strong" />}
              </div>
              <div className="text-xs text-muted-foreground">
                {stage.decidedBy ?? stage.assignedTo ?? "Unassigned"} ·{" "}
                {stage.decidedAt
                  ? formatRelativeTime(stage.decidedAt)
                  : stage.status === "current"
                  ? "In progress"
                  : "Not started"}
              </div>
              {stage.comments && (
                <div className="mt-1 rounded-lg bg-muted/60 px-2 py-1 text-xs text-muted-foreground">
                  "{stage.comments}"
                </div>
              )}
            </div>
            {direction === "row" && i < stages.length - 1 && (
              <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />
            )}
          </div>
        );
      })}
    </div>
  );
}
