import { StatusBadge } from "@/components/ui/status-badge";
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

// Colour comes from the shared status map (config/status-config.ts), like every other status badge.
export function WorkflowStatusBadge({ status }: WorkflowStatusBadgeProps) {
  return <StatusBadge status={STATUS_LABELS[status]} />;
}
