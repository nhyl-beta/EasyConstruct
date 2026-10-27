import { StatusBadge } from "@/components/ui/status-badge";
import { PRIORITY_CONFIG } from "@/config/status-config";

/** Priority pill (Low / Medium / High / Critical) using the shared priority scale. */
export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  return <StatusBadge status={priority} tone={PRIORITY_CONFIG[priority] ?? "neutral"} className={className} />;
}
