import { Link } from "react-router";
import { AlertTriangle, Clock, FileClock, Hourglass } from "lucide-react";

import { SectionCard } from "@/components/ui/section-card";
import { useAttention } from "../hooks/useRequests";

/**
 * "Needs attention" for Admin and Owner: overdue RFI/RFAs, requests drafted but
 * never sent, and workflow stages with no movement. Computed from live rows —
 * independent of FEATURE_AI.
 */
export function AttentionCard() {
  const { attention, loading, error } = useAttention(true);
  const total = attention ? attention.overdueRequests.length + attention.unsentDrafts.length + attention.stalledStages.length : 0;

  return (
    <SectionCard
      title="Needs attention"
      subtitle="Overdue requests, drafts nobody sent, and workflow stages that have not moved."
      badge={attention ? (total === 0 ? "All clear" : `${total} item${total === 1 ? "" : "s"}`) : undefined}
      actions={<AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden />}
    >
      {loading && !attention ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive-strong">{error}</p>
      ) : !attention || total === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is overdue or stuck right now.</p>
      ) : (
        <div className="space-y-4">
          {attention.overdueRequests.length > 0 && (
            <section aria-label="Overdue requests">
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-destructive-strong">
                <Clock className="h-3.5 w-3.5" /> Overdue requests
              </h4>
              <ul className="space-y-1">
                {attention.overdueRequests.slice(0, 6).map((r) => (
                  <li key={r.id} className="text-sm">
                    <Link to={`/requests?open=${r.id}`} className="hover:underline">
                      <span className="font-mono text-xs">{r.number}</span> {r.subject}
                    </Link>
                    <span className="block text-overline text-muted-foreground">
                      {r.projectCode} · {r.assignedToName ?? "unassigned"} · {r.daysOverdue} day{r.daysOverdue === 1 ? "" : "s"} overdue
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {attention.unsentDrafts.length > 0 && (
            <section aria-label="Drafts never sent">
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-warning-strong">
                <FileClock className="h-3.5 w-3.5" /> Drafts never sent
              </h4>
              <ul className="space-y-1">
                {attention.unsentDrafts.slice(0, 6).map((r) => (
                  <li key={r.id} className="text-sm">
                    <Link to={`/requests?open=${r.id}`} className="hover:underline">
                      <span className="font-mono text-xs">{r.number}</span> {r.subject}
                    </Link>
                    <span className="block text-overline text-muted-foreground">
                      {r.projectCode} · drafted by {r.requestedByName} · waiting {r.daysWaiting} day{r.daysWaiting === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {attention.stalledStages.length > 0 && (
            <section aria-label="Stalled workflow stages">
              <h4 className="mb-1 flex items-center gap-1.5 text-xs font-medium text-warning-strong">
                <Hourglass className="h-3.5 w-3.5" /> Workflow stages with no movement
              </h4>
              <ul className="space-y-1">
                {attention.stalledStages.slice(0, 6).map((s) => (
                  <li key={s.stageId} className="text-sm">
                    <Link to="/workflows" className="hover:underline">
                      {s.title}
                    </Link>
                    <span className="block text-overline text-muted-foreground">
                      {s.workflowCode} · {s.projectCode} · waiting on {s.roleLabel} for {s.daysStalled} day{s.daysStalled === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </SectionCard>
  );
}
