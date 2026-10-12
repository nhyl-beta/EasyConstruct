import { useMemo } from "react";
import { AlertTriangle, KeyRound, ShieldAlert, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useAuditLogs } from "@/features/audit-logs/hooks/useAuditLogs";
import { useSecurityOverview } from "@/features/audit-logs/hooks/useSecurityOverview";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { ReconciliationPanel } from "@/features/reconciliation/ReconciliationPanel";

// Sensitive actions worth surfacing prominently — the audit-logs table
// already records "rejected"/"deleted" across every module, so this filters
// the same real data rather than inventing a separate security-events table.
const SENSITIVE_ACTIONS = new Set(["rejected", "deleted"]);

const SIGNIN_PAGE_SIZE = 5;
const SIGNIN_PAGE_SIZES = [5, 10, 20];

export default function AdminSecurityPage() {
  const { logs, loading, error } = useAuditLogs();
  const security = useSecurityOverview();

  // Previously hard-capped at the first 20 (silently hiding the rest);
  // real pagination replaces that cap instead of stacking on top of it.
  const sensitiveEvents = useMemo(
    () => logs.filter((log) => SENSITIVE_ACTIONS.has(log.action)),
    [logs],
  );
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
        description="Sensitive operational events (rejections, deletions) drawn from the audit trail."
      />
      <PageContent className="space-y-6 p-6 md:p-8">
        <ReconciliationPanel />
        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldAlert className="h-4 w-4 text-destructive-strong" />
            Recent sensitive actions
          </h3>
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && error && (
            <p className="text-sm text-destructive-strong">Couldn't load audit data. {error.message}</p>
          )}
          {!loading && !error && sensitiveEvents.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No rejections or deletions recorded — nothing sensitive to review right now.
            </p>
          )}
          {!loading && sensitiveEvents.length > 0 && (
            <div className="space-y-2">
              {pagination.pageItems.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/10 text-destructive-strong">
                      {log.action === "deleted" ? (
                        <Trash2 className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {log.actor} {log.action} {log.entityType} #{log.entityId}
                      </p>
                      {log.summary && <p className="text-xs text-muted-foreground">{log.summary}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-full border-destructive/30 text-overline capitalize text-destructive-strong">
                      {log.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatRelativeTime(log.createdAt)}</span>
                  </div>
                </div>
              ))}
              <DataTablePagination {...pagination} />
            </div>
          )}
        </div>

        {/* Login & session monitoring. The auth endpoint now records every
            sign-in attempt into the audit trail (server/src/auth/service.ts),
            so this panel reads real data instead of standing empty. "Active
            sessions" is derived from successful sign-ins inside the token's
            8h lifetime — the JWT is stateless, so there is no session table
            to enumerate. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Users className="h-4 w-4 text-primary-strong" />
              Active sessions
              {!security.loading && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({security.sessions.length})
                </span>
              )}
            </h3>
            {security.loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!security.loading && security.error && (
              <p className="text-sm text-destructive-strong">
                Couldn't load sign-in activity. {security.error.message}
              </p>
            )}
            {!security.loading && !security.error && security.sessions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nobody has signed in within the last 8 hours.
              </p>
            )}
            {sessionsPagination.pageItems.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{s.actor}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.entityId}
                    {s.summary ? ` · ${s.summary}` : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(s.createdAt)}
                </span>
              </div>
            ))}
            {/* Hidden while everything fits on the first page. Keyed to the
                smallest page size rather than pageCount, so picking a larger
                size can't make the controls vanish with no way back. */}
            {!security.loading && security.sessions.length > SIGNIN_PAGE_SIZE && (
              <DataTablePagination {...sessionsPagination} compact pageSizeOptions={SIGNIN_PAGE_SIZES} />
            )}
          </div>

          <div className="min-w-0 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <KeyRound className="h-4 w-4 text-destructive-strong" />
              Failed sign-in attempts
              {!security.loading && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({security.totalFailedLogins.toLocaleString()})
                </span>
              )}
            </h3>
            {!security.loading && failedLoginsCapped && (
              <p className="text-xs text-muted-foreground">
                Showing the latest {security.failedLogins.length.toLocaleString()} of{" "}
                {security.totalFailedLogins.toLocaleString()}. Older attempts remain in the audit trail.
              </p>
            )}
            {security.loading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!security.loading && !security.error && security.failedLogins.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No failed sign-in attempts recorded.
              </p>
            )}
            {failedLoginsPagination.pageItems.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{f.entityId}</p>
                  {f.summary && (
                    <p className="text-xs text-muted-foreground">{f.summary}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatRelativeTime(f.createdAt)}
                </span>
              </div>
            ))}
            {!security.loading && security.failedLogins.length > SIGNIN_PAGE_SIZE && (
              <DataTablePagination {...failedLoginsPagination} compact pageSizeOptions={SIGNIN_PAGE_SIZES} />
            )}
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}

AdminSecurityPage.displayName = "AdminSecurityPage";
