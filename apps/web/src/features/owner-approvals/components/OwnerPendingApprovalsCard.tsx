import { MailCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useOwnerApprovals } from "../hooks/use-owner-approvals";

const TONE = { pending: "warning", approved: "success", declined: "danger", expired: "neutral", cancelled: "neutral" } as const;
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

/**
 * Owner dashboard: changes to the Owner account that are waiting for the Owner, and a short history. The approval
 * itself is decided from the email link, never from here, so a stolen session cannot approve its own change.
 */
export function OwnerPendingApprovalsCard() {
  const { requests, loading, error } = useOwnerApprovals();
  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending").slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailCheck className="h-4 w-4" /> Pending account approvals
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading && <p className="text-muted-foreground">Loading…</p>}
        {error && <p className="text-destructive-strong">{error}</p>}
        {!loading && !error && pending.length === 0 && <p className="text-muted-foreground">Nothing is waiting for your approval.</p>}
        {pending.map((r) => (
          <div key={r.id} className="rounded-xl border border-warning/30 bg-warning/10 p-3">
            <div className="font-medium">{r.actionLabel}</div>
            <div className="text-muted-foreground">
              Asked by {r.requestedByName} · expires {when(r.expiresAt)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Open the email we sent to your address to approve or decline it.</div>
          </div>
        ))}
        {history.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <div className="text-overline uppercase tracking-wider text-muted-foreground">Recent</div>
            {history.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2">
                <StatusBadge status={r.status[0]!.toUpperCase() + r.status.slice(1)} tone={TONE[r.status]} />
                <span>{r.actionLabel}</span>
                <span className="text-xs text-muted-foreground">by {r.requestedByName}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
