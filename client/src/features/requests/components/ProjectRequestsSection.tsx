import { useState } from "react";
import { Link } from "react-router";
import { MessageSquareQuote, Plus } from "lucide-react";

import { useAuth } from "@/auth/auth-context";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { useRequests } from "../hooks/useRequests";
import { CreateRequestDialog } from "./CreateRequestDialog";
import { EmailStatusBadge, formatDate, KindBadge, OverdueBadge, RequestStatusBadge } from "./RequestBadges";
import { RequestDetailSheet } from "./RequestDetailSheet";

const RAISERS = new Set(["project-manager", "engineer", "admin"]);

/** RFIs and RFAs on one project, with due dates; opens the same detail drawer as the Requests page. */
export function ProjectRequestsSection({ projectCode }: { projectCode: string }) {
  const { user } = useAuth();
  const { requests, loading, error, reload } = useRequests({ projectCode });
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const canRaise = RAISERS.has(user?.role ?? "");
  const openCount = requests.filter((r) => r.isOpen).length;
  const overdue = requests.filter((r) => r.isOverdue).length;

  return (
    <>
      <SectionCard
        title="Requests (RFI / RFA)"
        subtitle="Questions and approvals between the site and the design team. An open request blocks closing the project."
        badge={requests.length > 0 ? `${openCount} open${overdue ? ` · ${overdue} overdue` : ""}` : undefined}
        actions={
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" className="h-8 text-xs" asChild>
              <Link to="/requests">All requests</Link>
            </Button>
            {canRaise && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setCreating(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Raise
              </Button>
            )}
          </div>
        }
      >
        {loading && requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading requests…</p>
        ) : error ? (
          <div role="alert" className="flex items-center justify-between gap-3 text-sm text-destructive-strong">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={reload}>Retry</Button>
          </div>
        ) : requests.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquareQuote className="h-4 w-4" /> No requests have been raised on this project.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {requests.slice(0, 8).map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setOpen(r.id)} className="flex w-full flex-wrap items-center justify-between gap-2 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="flex min-w-0 items-center gap-2">
                    <KindBadge kind={r.kind} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{r.subject}</span>
                      <span className="block font-mono text-overline text-muted-foreground">
                        {r.number} · {r.recipientType === "client" ? "Client" : (r.assignedToName ?? "unassigned")}
                        {r.dueDate ? ` · due ${formatDate(r.dueDate)}` : ""}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <RequestStatusBadge status={r.status} />
                    <EmailStatusBadge request={r} />
                    <OverdueBadge request={r} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <RequestDetailSheet id={open} onOpenChange={(o) => !o && setOpen(null)} onChanged={reload} />
      <CreateRequestDialog open={creating} onOpenChange={setCreating} initial={{ projectCode }} onCreated={(r) => { reload(); setOpen(r.id); }} />
    </>
  );
}
