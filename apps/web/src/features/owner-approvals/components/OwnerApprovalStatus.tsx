import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { OwnerApprovalRequest } from "../repositories/owner-approvals.repository";

const TONE = { pending: "warning", approved: "success", declined: "danger", expired: "neutral", cancelled: "neutral" } as const;
const LABEL = { pending: "Pending approval", approved: "Approved", declined: "Declined", expired: "Expired", cancelled: "Cancelled" } as const;

/**
 * Next to the Owner's row on the IT Designer's accounts page: every pending request for that account (with a Cancel
 * button, since the requester can withdraw their own) and the outcome of the latest answered one.
 */
export function OwnerApprovalStatus({
  requests,
  onCancel,
}: {
  /** Requests for this account, newest first. */
  requests: OwnerApprovalRequest[];
  onCancel: (id: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = requests.filter((r) => r.status === "pending");
  const latestDone = requests.find((r) => r.status !== "pending");
  if (pending.length === 0 && !latestDone) return null;

  const cancel = async (id: number) => {
    setBusy(id);
    setError(null);
    try {
      await onCancel(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't cancel the request");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-1.5 space-y-1">
      {pending.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge status={LABEL.pending} tone={TONE.pending} />
          <span>{r.actionLabel}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={busy === r.id} onClick={() => void cancel(r.id)}>
            Cancel request
          </Button>
        </div>
      ))}
      {latestDone && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusBadge status={LABEL[latestDone.status]} tone={TONE[latestDone.status]} />
          <span>{latestDone.actionLabel}</span>
        </div>
      )}
      {error && <p className="text-xs text-destructive-strong">{error}</p>}
    </div>
  );
}
