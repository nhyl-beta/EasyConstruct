import { Badge } from "@/components/ui/badge";
import { STATUS_TONES } from "@/config/status-tone";
import { BATCH_STATUS_LABEL } from "@/features/hr/payroll-api";

const TONE: Record<string, string> = {
  draft: STATUS_TONES.neutral,
  pending: STATUS_TONES.warning,
  approved: STATUS_TONES.success,
  revision_required: STATUS_TONES.danger,
};

export function BatchStatusPill({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`rounded-full text-overline ${TONE[status] ?? ""}`}>
      {BATCH_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}
