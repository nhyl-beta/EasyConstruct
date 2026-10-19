import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EMAIL_STATUS_LABEL, STATUS_LABEL, type DesignRequest, type EmailStatus, type RequestKind, type RequestStatus } from "../types/request.types";

const TONE: Record<RequestStatus, string> = {
  draft: "border-transparent bg-muted text-muted-foreground",
  open: "border-transparent bg-info-soft text-info-strong",
  in_review: "border-transparent bg-warning-soft text-warning-strong",
  client_replied: "border-transparent bg-primary-soft text-primary-strong",
  answered: "border-transparent bg-success-soft text-success-strong",
  approved: "border-transparent bg-success-soft text-success-strong",
  approved_as_noted: "border-transparent bg-primary-soft text-primary-strong",
  rejected: "border-transparent bg-destructive-soft text-destructive-strong",
  closed: "border-transparent bg-muted text-muted-foreground",
};

export function RequestStatusBadge({ status, className }: { status: RequestStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-full text-overline font-medium", TONE[status], className)}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function KindBadge({ kind }: { kind: RequestKind }) {
  return (
    <Badge variant="outline" className="rounded-md px-1.5 font-mono text-overline font-semibold">
      {kind}
    </Badge>
  );
}

export function OverdueBadge({ request }: { request: Pick<DesignRequest, "isOverdue"> }) {
  if (!request.isOverdue) return null;
  return (
    <Badge variant="outline" className="rounded-full border-transparent bg-destructive-soft text-overline font-medium text-destructive-strong">
      Overdue
    </Badge>
  );
}

/** "Client" + the address, for a request that was emailed to the project's client. */
export function RecipientBadge({ request, showEmail = false }: { request: Pick<DesignRequest, "recipientType" | "recipientEmail">; showEmail?: boolean }) {
  if (request.recipientType !== "client") return null;
  return (
    <Badge variant="outline" className="max-w-full rounded-full border-transparent bg-secondary text-overline font-medium text-secondary-foreground">
      <span className="truncate">{showEmail && request.recipientEmail ? `Client · ${request.recipientEmail}` : "Client"}</span>
    </Badge>
  );
}

const EMAIL_TONE: Record<EmailStatus, string> = {
  not_sent: "border-transparent bg-muted text-muted-foreground",
  sent: "border-transparent bg-success-soft text-success-strong",
  failed: "border-transparent bg-destructive-soft text-destructive-strong",
};

/** Whether the email to the client went out. Shown for client requests only (and only once it was attempted). */
export function EmailStatusBadge({ request }: { request: Pick<DesignRequest, "recipientType" | "emailStatus"> }) {
  if (request.recipientType !== "client" || request.emailStatus === "not_sent") return null;
  return (
    <Badge variant="outline" className={cn("rounded-full text-overline font-medium", EMAIL_TONE[request.emailStatus])}>
      Email {EMAIL_STATUS_LABEL[request.emailStatus].toLowerCase()}
    </Badge>
  );
}

export const formatDate = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

export const formatDateTime = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
