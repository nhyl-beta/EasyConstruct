import { Badge } from "@/components/ui/badge";
import { BATCH_STATUS_LABEL } from "@/features/hr/payroll-api";

const TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  pending: "bg-warning/15 text-warning-strong border-warning/30",
  approved: "bg-success/10 text-success-strong border-success/20",
  revision_required: "bg-destructive/10 text-destructive-strong border-destructive/20",
};

export function BatchStatusPill({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`rounded-full text-overline ${TONE[status] ?? ""}`}>
      {BATCH_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
