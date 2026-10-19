import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { STATUS_CONFIG } from "@/config/status-config";
import { STATUS_TONES, type StatusTone } from "@/config/status-tone";

interface StatusBadgeProps {
  status: string;
  /** Overrides the tone looked up from the status registry. */
  tone?: StatusTone;
  className?: string;
}

/** A leading dot plus the status word; the dot is decoration. */
export function StatusBadge({ status, tone, className }: StatusBadgeProps) {
  const resolved = tone ?? STATUS_CONFIG[status] ?? "neutral";

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 rounded-full px-2.5 text-caption font-medium before:size-1.5 before:shrink-0 before:rounded-full before:bg-current before:content-['']",
        STATUS_TONES[resolved],
        className
      )}
    >
      {status}
    </Badge>
  );
}
