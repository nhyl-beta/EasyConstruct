// apps/web/src/components/workflows/reference-basis-badge.tsx — NEW (ai-signals E4)
//
// Shows a workflow line item's decision-support cost comparison — the
// verdict and variance, with the full citation (basisSummary) in a popover.
// Purely informational: nothing here can approve, reject, or otherwise
// mutate the workflow it's attached to.
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { LineItemValidationSummary } from "@/features/workflows/types/workflow.types";

const VERDICT_STYLE: Record<LineItemValidationSummary["verdict"], { label: string; className: string }> = {
  "within-range": { label: "Within range", className: "border-success/30 bg-success/10 text-success-strong" },
  "above-typical": { label: "Above typical", className: "border-destructive/30 bg-destructive/10 text-destructive-strong" },
  "below-typical": { label: "Below typical", className: "border-info/30 bg-info/10 text-info-strong" },
  "no-match": { label: "No comparable reference", className: "border-border text-muted-foreground" },
};

export function ReferenceBasisBadge({ validation }: { validation: LineItemValidationSummary }) {
  const style = VERDICT_STYLE[validation.verdict];
  const variancePct = validation.variancePct != null ? validation.variancePct * 100 : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex">
          <Badge variant="outline" className={`gap-1 rounded-full text-overline ${style.className}`}>
            <Info className="h-2.5 w-2.5" />
            {style.label}
            {variancePct != null && ` (${variancePct > 0 ? "+" : ""}${variancePct.toFixed(1)}%)`}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-xs leading-relaxed">
        <p className="mb-1 font-medium text-foreground">Decision support — cost reference</p>
        <p className="text-muted-foreground">{validation.basisSummary}</p>
        {validation.verdict === "no-match" && (
          <p className="mt-2 text-muted-foreground/80">
            No range is shown when there is no basis for a comparison.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

ReferenceBasisBadge.displayName = "ReferenceBasisBadge";
