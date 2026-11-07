import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, KeyRound, ShieldAlert, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const PREVIEW_ROWS = 5;

/**
 * B-66: a section that starts collapsed, shows its first 5 rows when opened, and keeps the
 * full paginated list behind "View all".
 */
function CollapsibleList({
  heading,
  total,
  rows,
  fullList,
}: {
  heading: ReactNode;
  total: number;
  rows: ReactNode[];
  fullList: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <div className="min-w-0 space-y-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold text-foreground"
      >
        <Chevron className="h-4 w-4 text-muted-foreground" />
        {heading}
      </button>
      {open && (
        <div className="space-y-2">
          {all ? fullList : rows.slice(0, PREVIEW_ROWS)}
          {!all && total > PREVIEW_ROWS && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAll(true)}>
              View all ({total.toLocaleString()})
            </Button>
          )}
          {all && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setAll(false)}>
              Show fewer
            </Button>
          )}
        </div>
      )}
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
        {/* Each section starts collapsed (B-66): first 5 rows when opened, the paginated list behind "View all". */}
        <div className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading sensitive actions…</p>}
          {!loading && error && (
            <p className="text-sm text-destructive-strong">Couldn't load audit data. {error.message}</p>
          )}
          {!loading && !error && (
            <CollapsibleList
              heading={
                <>
                  <ShieldAlert className="h-4 w-4 text-destructive-strong" />
                  Recent sensitive actions
                  <span className="text-xs font-normal text-muted-foreground">({sensitiveEvents.length})</span>
                </>
              }
              total={sensitiveEvents.length}
              rows={sensitiveEvents.length === 0 ? [<p key="none" className="text-sm text-muted-foreground">Nothing sensitive recorded — no rejections, deletions, legal downloads or damaged files.</p>] : sensitiveEvents.map(renderEvent)}
              fullList={
                <>
                  {pagination.pageItems.map(renderEvent)}
                  <DataTablePagination {...pagination} />
                </>
              }
            />
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
              <CollapsibleList
                heading={
                  <>
                    <Users className="h-4 w-4 text-primary-strong" />
                    Active sessions
                    <span className="text-xs font-normal text-muted-foreground">({security.sessions.length})</span>
                  </>
                }
                total={security.sessions.length}
                rows={security.sessions.length === 0 ? [<p key="none" className="text-sm text-muted-foreground">Nobody has signed in within the last 8 hours.</p>] : security.sessions.map(renderSession)}
                fullList={
                  <>
                    {sessionsPagination.pageItems.map(renderSession)}
                    <DataTablePagination {...sessionsPagination} compact />
                  </>
                }
              />
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
                <CollapsibleList
                  heading={
                    <>
                      <KeyRound className="h-4 w-4 text-destructive-strong" />
                      Failed sign-in attempts
                      <span className="text-xs font-normal text-muted-foreground">({security.totalFailedLogins.toLocaleString()})</span>
                    </>
                  }
                  total={security.failedLogins.length}
                  rows={security.failedLogins.length === 0 ? [<p key="none" className="text-sm text-muted-foreground">No failed sign-in attempts recorded.</p>] : security.failedLogins.map(renderFailed)}
                  fullList={
                    <>
                      {failedLoginsPagination.pageItems.map(renderFailed)}
                      <DataTablePagination {...failedLoginsPagination} compact />
                    </>
                  }
                />
              </>
            )}
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}

AdminSecurityPage.displayName = "AdminSecurityPage";
