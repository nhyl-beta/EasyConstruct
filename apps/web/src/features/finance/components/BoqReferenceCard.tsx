import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format-currency";
import { apiClient } from "@/services/api.client";

export interface BoqReference {
  proposalId: string;
  title: string;
  amount: number;
}

/**
 * The Bill of Materials totals of a project's approved proposals (the file the Architect sent through the
 * proposal approval), offered as the reference for a Materials budget line or purchase request.
 */
export function BoqReferenceCard({
  project,
  currency,
  onUse,
}: {
  project: string;
  currency?: string;
  onUse: (ref: BoqReference) => void;
}) {
  const [refs, setRefs] = useState<BoqReference[]>([]);
  useEffect(() => {
    setRefs([]);
    if (!project) return;
    let cancelled = false;
    apiClient
      .get(`/finance/budgets/boq-reference?project=${encodeURIComponent(project)}`)
      .then((json) => !cancelled && setRefs(Array.isArray(json?.data) ? json.data : []))
      .catch(() => undefined); // a reference is a convenience; the form works without it
    return () => {
      cancelled = true;
    };
  }, [project]);

  if (!project) return null;
  return (
    <div className="space-y-1 rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
      <p className="font-medium">Bill of Materials reference</p>
      {refs.length === 0 ? (
        <p className="text-muted-foreground">No approved proposal with a Bill of Materials for this project yet.</p>
      ) : (
        refs.map((r) => (
          <div key={r.proposalId} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-muted-foreground">
              {r.proposalId} · {r.title}
            </span>
            <Button type="button" size="sm" variant="outline" className="h-6 shrink-0 text-xs" onClick={() => onUse(r)}>
              Use {formatCurrency(r.amount, currency)}
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
