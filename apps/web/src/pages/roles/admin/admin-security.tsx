import { useMemo, type ReactNode } from "react";
import { AlertTriangle, KeyRound, ShieldAlert, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { DEFAULT_PAGE_SIZE } from "@/config/pagination";
import { useAuditLogs } from "@/features/audit-logs/hooks/useAuditLogs";
import { useSecurityOverview } from "@/features/audit-logs/hooks/useSecurityOverview";
import { formatRelativeTime } from "@/lib/format-relative-time";
import type { AuditLog } from "@/features/audit-logs/types/audit-log.types";
import { ReconciliationPanel } from "@/features/reconciliation/ReconciliationPanel";

// Sensitive actions worth surfacing prominently — the audit-logs table
// already records "rejected"/"deleted" across every module, so this filters
// the same real data rather than inventing a separate security-events table.
// Rejections and deletions, plus downloads of Legal documents, refused downloads and files that failed
// their integrity check (client demo changes #2 and #3). The server filters, so the downloads log
// (every download is recorded) is never loaded here.
const SENSITIVE_ACTIONS = ["rejected", "deleted", "sensitive_download", "download_blocked", "integrity_failed"];

const SIGNIN_PAGE_SIZE = DEFAULT_PAGE_SIZE;


const rowClass = "flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3";

const renderEvent = (log: AuditLog) => (
  <div key={log.id} className={rowClass}>
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive-strong">
        {log.action === "deleted" ? <Trash2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </div>
      <div>
        <p className="text-sm font-medium">
          {log.actor} {log.action.replace(/_/g, " ")} {log.entityType} #{log.entityId}
        </p>
        {log.summary && <p className="text-xs text-muted-foreground">{log.summary}</p>}
      </div>
    </div>
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="rounded-full border-destructive/30 text-overline capitalize text-destructive-strong">
        {log.action.replace(/_/g, " ")}
      </Badge>
      <span className="text-xs text-muted-foreground">{formatRelativeTime(log.createdAt)}</span>
    </div>
  </div>
);

const renderSession = (s: AuditLog) => (
  <div key={s.id} className={rowClass}>
    <div>
      <p className="text-sm font-medium">{s.actor}</p>
      <p className="text-xs text-muted-foreground">
        {s.entityId}
        {s.summary ? ` · ${s.summary}` : ""}
      </p>
    </div>
    <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(s.createdAt)}</span>
  </div>
);

const renderFailed = (f: AuditLog) => (
  <div key={f.id} className={rowClass}>
    <div>
      <p className="text-sm font-medium">{f.entityId}</p>
      {f.summary && <p className="text-xs text-muted-foreground">{f.summary}</p>}
    </div>
    <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(f.createdAt)}</span>
  </div>
);

/** B-73/B-74: a heading and its list, always open and paginated in place (no accordion, no "View all"). */
function Section({ heading, total, empty, children }: { heading: ReactNode; total: number; empty: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">{heading}</h3>
      {total === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <div className="space-y-2">{children}</div>}
    </div>
  );
}

export default function AdminSecurityPage({ belowHeader }: { belowHeader?: ReactNode } = {}) {
  const { logs, loading, error } = useAuditLogs({ actions: SENSITIVE_ACTIONS });
  const security = useSecurityOverview();

  // Previously hard-capped at the first 20 (silently hiding the rest);
  // real pagination replaces that cap instead of stacking on top of it.
  const sensitiveEvents = useMemo(() => logs, [logs]);
  const pagination = usePagination(sensitiveEvents, 10);

  // Each login panel pages on its own: separate state, so turning a page in
  // one never moves the other. 5 per page fits the half-width columns.
  const sessionsPagination = usePagination(security.sessions, SIGNIN_PAGE_SIZE);
  const failedLoginsPagination = usePagination(security.failedLogins, SIGNIN_PAGE_SIZE);
  const failedLoginsCapped = security.totalFailedLogins > security.failedLogins.length;

  return (
    <PageContainer>
      <PageHeader
        title="Security monitoring"
        description="Sensitive events from the audit trail: rejections, deletions, legal file downloads and damaged files."
      />
      <PageContent className="space-y-6 p-6 md:p-8">
        {belowHeader}
        <ReconciliationPanel />
                <div className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading sensitive actions…</p>}
          {!loading && error && (
            <p className="text-sm text-destructive-strong">Couldn't load audit data. {error.message}</p>
          )}
          {!loading && !error && (
            <Section
              heading={
                <>
                  <ShieldAlert className="h-4 w-4 text-destructive-strong" />
                  Recent sensitive actions
                  <span className="text-xs font-normal text-muted-foreground">({sensitiveEvents.length})</span>
                </>
              }
              total={sensitiveEvents.length}
              empty="Nothing sensitive recorded — no rejections, deletions, legal downloads or damaged files."
              >
                <>
                  {pagination.pageItems.map(renderEvent)}
                  <DataTablePagination {...pagination} />
                </>
            </Section>
          )}
        </div>

        {/* Login & session monitoring. The auth endpoint records every sign-in attempt into the
            audit trail, so "Active sessions" is derived from successful sign-ins inside the token's
            8h lifetime (the JWT is stateless, there is no session table). */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            {security.loading && <p className="text-sm text-muted-foreground">Loading sign-in activity…</p>}
            {!security.loading && security.error && (
              <p className="text-sm text-destructive-strong">Couldn't load sign-in activity. {security.error.message}</p>
            )}
            {!security.loading && !security.error && (
              <Section
                heading={
                  <>
                    <Users className="h-4 w-4 text-primary-strong" />
                    Active sessions
                    <span className="text-xs font-normal text-muted-foreground">({security.sessions.length})</span>
                  </>
                }
                total={security.sessions.length}
                empty="Nobody has signed in within the last 8 hours."
                >
                  <>
                    {sessionsPagination.pageItems.map(renderSession)}
                    <DataTablePagination {...sessionsPagination} compact />
                  </>
              </Section>
            )}
          </div>

          <div className="min-w-0 space-y-3">
            {!security.loading && !security.error && (
              <>
                {failedLoginsCapped && (
                  <p className="text-xs text-muted-foreground">
                    Showing the latest {security.failedLogins.length.toLocaleString()} of{" "}
                    {security.totalFailedLogins.toLocaleString()}. Older attempts remain in the audit trail.
                  </p>
                )}
                <Section
                  heading={
                    <>
                      <KeyRound className="h-4 w-4 text-destructive-strong" />
                      Failed sign-in attempts
                      <span className="text-xs font-normal text-muted-foreground">({security.totalFailedLogins.toLocaleString()})</span>
                    </>
                  }
                  total={security.failedLogins.length}
                  empty="No failed sign-in attempts recorded."
                  >
                    <>
                      {failedLoginsPagination.pageItems.map(renderFailed)}
                      <DataTablePagination {...failedLoginsPagination} compact />
                    </>
                </Section>
              </>
            )}
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}

AdminSecurityPage.displayName = "AdminSecurityPage";
