// Who a client RFI/RFA went to and how each copy fared: sent, failed or replied, with a Resend button per
// person (client demo changes #5 and #6). Replies written through the email link show under each person.
import { useState } from "react";
import { CheckCircle2, Mail, MailWarning, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { RequestRepository } from "../repositories/request.repository";
import type { RequestRecipient } from "../types/request.types";

type Look = { label: string; className: string; Icon: typeof Mail };

const lookOf = (r: RequestRecipient): Look => {
  if (r.repliedAt) return { label: "Replied", className: "border-success/30 bg-success/10 text-success-strong", Icon: CheckCircle2 };
  if (r.emailStatus === "failed") return { label: "Failed", className: "border-destructive/30 bg-destructive/10 text-destructive-strong", Icon: MailWarning };
  if (r.emailStatus === "sent") return { label: "Sent", className: "border-primary/30 bg-primary/10 text-primary-strong", Icon: Mail };
  return { label: "Not sent", className: "border-border bg-muted/50 text-muted-foreground", Icon: Mail };
};

export function RecipientsList({
  requestId,
  recipients,
  canResend,
  onChanged,
}: {
  requestId: number;
  recipients: RequestRecipient[];
  /** The sender, the PM and the Admin may resend; everyone else just sees the status. */
  canResend: boolean;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resend = async (r: RequestRecipient) => {
    setBusyId(r.id);
    setError(null);
    try {
      await RequestRepository.resendEmail(requestId, r.id);
      onChanged();
      toast.success(`Email re-sent to ${r.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend the email");
    } finally {
      setBusyId(null);
    }
  };

  if (recipients.length === 0) return null;
  return (
    <section>
      <h4 className="text-xs font-medium text-muted-foreground">Sent to</h4>
      <ul className="mt-1 space-y-2">
        {recipients.map((r) => {
          const { label, className, Icon } = lookOf(r);
          return (
            <li key={r.id} className="rounded-lg border border-border p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 text-sm font-medium">
                  {r.name}
                  {r.email && <span className="block break-all text-xs font-normal text-muted-foreground">{r.email}</span>}
                </span>
                <Badge variant="outline" className={cn("gap-1 rounded-full text-overline", className)}>
                  <Icon className="h-3 w-3" aria-hidden /> {label}
                </Badge>
                {canResend && !r.repliedAt && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId !== null || !r.canResend} onClick={() => void resend(r)} title={r.canResend ? undefined : "No resends left for this person"}>
                    <RefreshCw className={cn("h-3 w-3", busyId === r.id && "animate-spin")} /> Resend
                  </Button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.repliedAt ? `Replied ${formatRelativeTime(r.repliedAt)}` : r.sentAt ? `Sent ${formatRelativeTime(r.sentAt)}` : "Not sent yet"}
                {r.resendCount > 0 ? ` · re-sent ${r.resendCount} time${r.resendCount === 1 ? "" : "s"}` : ""}
              </p>
              {r.responseText && (
                <div className="mt-2 rounded-md bg-muted/40 p-2">
                  <p className="whitespace-pre-wrap text-sm">{r.responseText}</p>
                  {(r.responderName || r.responderPosition) && (
                    <p className="mt-1 text-xs text-muted-foreground">{[r.responderName, r.responderPosition].filter(Boolean).join(", ")}</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-1 text-xs text-destructive-strong">
          {error}
        </p>
      )}
    </section>
  );
}
