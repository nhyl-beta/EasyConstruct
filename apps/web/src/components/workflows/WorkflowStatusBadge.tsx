import type { WorkflowStatus } from "@/features/workflows/types/workflow.types";

interface WorkflowStatusBadgeProps {
  status: WorkflowStatus;
}

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  active: "Active",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const STATUS_CLASSES: Record<WorkflowStatus, string> = {
  active:
    "border-transparent bg-info-soft text-info-strong",
  completed:
    "border-transparent bg-success-soft text-success-strong",
  rejected:
    "border-transparent bg-destructive-soft text-destructive-strong",
  cancelled:
    "border-transparent bg-muted text-muted-foreground",
};

export function WorkflowStatusBadge({
  status,
}: WorkflowStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
