import { STATUS_TONES } from "@/config/status-tone";
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
  active: STATUS_TONES.info,
  completed: STATUS_TONES.success,
  rejected: STATUS_TONES.danger,
  cancelled: STATUS_TONES.neutral,
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
