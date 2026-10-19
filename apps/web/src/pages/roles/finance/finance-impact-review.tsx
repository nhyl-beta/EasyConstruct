// apps/web/src/pages/roles/finance/finance-impact-review.tsx
//
// Finance's review of what a budget change actually changes.
//
// A budget-change request reached Finance as a single headline amount on the
// approval queue — "₱250,000" — with no way to see the materials, labour and
// other-cost movements behind it, which is the only thing a cost review can
// actually be about. This lists those line items per request, with the
// justification the engineer filed alongside them.
//
// The data is the Budget Change Request workflows themselves
// (GET /api/workflows/budget-change-requests), not a parallel store: the
// request IS the workflow, so Finance is reading the same record it later
// approves from /approvals.
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Wallet } from "lucide-react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  WorkflowAttachmentList,
  WorkflowLineItemsTable,
} from "@/components/workflows/workflow-submission-panel";
import { WorkflowStagePipeline } from "@/components/workflows/workflow-stage-pipeline";
import { useBudgetChangeRequests } from "@/features/workflows/hooks/useWorkflows";
import { ImpactForecastCard } from "@/features/workflows/components/ImpactForecastCard";
import { WorkflowRepository } from "@/features/workflows/repositories/workflow.repository";
import { formatCurrency } from "@/lib/format-currency";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { FEATURES } from "@/config/features";
import { RefreshCw } from "lucide-react";
import type { Workflow } from "@/features/workflows/types/workflow.types";

function netChangeOf(workflow: Workflow): number {
  return workflow.lineItems.reduce(
    (sum, item) => sum + (Number(item.requestedAmount) - Number(item.currentAmount)),
    0,
  );
}

function RequestCard({ request, onRevalidated }: { request: Workflow; onRevalidated: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const netChange = netChangeOf(request);
  const currentStage = request.stages.find((stage) => stage.status === "current");

  const handleRevalidate = async () => {
    setRevalidating(true);
    try {
      await WorkflowRepository.revalidate(request.id);
      onRevalidated();
    } catch {
      // Decision support only — a failed re-check is not worth surfacing
      // as a page-level error, the stale badge just stays as it was.
    } finally {
      setRevalidating(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <button
          type="button"
          className="flex w-full items-start gap-3 text-left"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary/60 text-secondary-foreground">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-overline text-muted-foreground">
                {request.code}
              </span>
              <span className="font-medium">{request.title}</span>
              <StatusBadge status={request.status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{request.projectCode}</span>
              <span>·</span>
              <span>Raised by {request.createdBy}</span>
              <span>·</span>
              <span>{formatRelativeTime(request.createdAt)}</span>
              {currentStage && (
                <>
                  <span>·</span>
                  <span>Awaiting {currentStage.roleLabel}</span>
                </>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full text-overline">
                {request.lineItems.length}{" "}
                {request.lineItems.length === 1 ? "change" : "changes"}
              </Badge>
              {request.attachments.length > 0 && (
                <Badge variant="outline" className="rounded-full text-overline">
                  {request.attachments.length} submitted{" "}
                  {request.attachments.length === 1 ? "item" : "items"}
                </Badge>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div className="text-overline uppercase tracking-wider text-muted-foreground">
              Net change
            </div>
            <div
              className={`text-lg font-semibold tabular-nums ${
                netChange > 0 ? "text-destructive-strong" : netChange < 0 ? "text-success-strong" : ""
              }`}
            >
              {netChange > 0 ? "+" : ""}
              {formatCurrency(netChange)}
            </div>
          </div>
        </button>

        {expanded && (
          <div className="mt-4 space-y-5 border-t border-border pt-4">
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Requested changes
                </h3>
                {FEATURES.ai && request.lineItems.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={revalidating}
                    onClick={handleRevalidate}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${revalidating ? "animate-spin" : ""}`} />
                    {revalidating ? "Re-checking…" : "Re-check market cost"}
                  </Button>
                )}
              </div>
              {request.lineItems.length > 0 ? (
                <WorkflowLineItemsTable lineItems={request.lineItems} />
              ) : (
                <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
                  This request was raised without itemised cost changes.
                </p>
              )}
            </section>

            <ImpactForecastCard workflowId={request.id} />

            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Justification & supporting documents
              </h3>
              <WorkflowAttachmentList attachments={request.attachments} />
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Approval chain
              </h3>
              <WorkflowStagePipeline stages={request.stages} direction="column" />
            </section>

            <p className="text-xs text-muted-foreground">
              Decide on this request from the Approvals page when its Finance
              Review stage is the current one — this screen is the cost
              breakdown, not a second decision point.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ImpactReviewPage() {
  const { requests, loading, error, reload } = useBudgetChangeRequests();
  const pg = usePagination(requests, 10);

  const kpis = useMemo(() => {
    const open = requests.filter((r) => r.status === "active");
    const totalRequested = open.reduce((sum, r) => sum + netChangeOf(r), 0);
    const lineCount = open.reduce((sum, r) => sum + r.lineItems.length, 0);
    return { open: open.length, totalRequested, lineCount };
  }, [requests]);

  return (
    <PageContainer>
      <PageHeader
        title="Budget change review"
        description="The materials, labour and other-cost changes behind each budget change request, with the justification filed against it."
      />
      <PageContent className="space-y-6 p-4 md:p-8">
        <KpiStrip
          items={[
            { label: "Open requests", value: `${kpis.open}`, icon: Wallet },
            {
              label: "Net requested",
              value: formatCurrency(kpis.totalRequested),
              icon: Wallet,
              tone: kpis.totalRequested > 0 ? "warn" : undefined,
            },
            { label: "Line items", value: `${kpis.lineCount}`, icon: Wallet },
          ]}
        />

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive-strong"
          >
            Couldn't load budget change requests. {error.message}
          </p>
        )}

        {loading && <p className="text-sm text-muted-foreground">Loading requests…</p>}

        {!loading && !error && requests.length === 0 && (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No budget change requests have been raised yet. Engineers raise
              them from their Approvals page.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {pg.pageItems.map((request) => (
            <RequestCard key={request.id} request={request} onRevalidated={() => void reload()} />
          ))}
          <div className="pt-2">
            <DataTablePagination {...pg} />
          </div>
        </div>
      </PageContent>
    </PageContainer>
  );
}

ImpactReviewPage.displayName = "ImpactReviewPage";
