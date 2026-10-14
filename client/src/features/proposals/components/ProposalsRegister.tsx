import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
// client/src/features/proposals/components/ProposalsRegister.tsx
//
// The read-only view of the proposal register. Owner and IT Designer both
// oversee proposals without reviewing them — IT Designer's screen previously
// carried the full Approve / Request Revision / Reject flow, which is the
// Consultant's decision to make and is now refused by the API for any other
// role (server/src/proposals/routes.ts). Rather than deleting those controls
// from one page and leaving two near-identical implementations to drift, both
// oversight screens render this.
//
// Selecting a row opens the proposal's full detail — content, AI validation,
// reviewer, decision and timestamps — so "read-only" still means seeing
// everything about a submission, just not changing it.
import { useState } from "react";
import { FileText, Search } from "lucide-react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import { FEATURES } from "@/config/features";
import { useProposals } from "../hooks/useProposals";
import type { Proposal } from "../types/proposal.types";
import { ProposalsTable } from "./ProposalsTable";
import { ProposalValidationPanel } from "./ProposalValidationPanel";

interface ProposalsRegisterProps {
  title: string;
  description: string;
}

export function ProposalsRegister({
  title,
  description,
}: ProposalsRegisterProps) {
  const { proposals, loading, error, kpis, query: search, setQuery: setSearch, pagination } = useProposals();
  const [selected, setSelected] = useState<Proposal | null>(null);

  const filtered = proposals;

  return (
    <PageContainer>
      <PageHeader title={title} description={description} />
      <PageContent className="space-y-6 p-6 md:p-8">
        <KpiStrip
          items={[
            { label: "Total proposals", value: `${kpis.total}`, icon: FileText },
            { label: "Pending review", value: `${kpis.pending}`, icon: FileText, tone: kpis.pending > 0 ? "warn" : "neutral" },
            { label: "Approved", value: `${kpis.approved}`, icon: FileText, tone: "good" },
            { label: "Revision requested", value: `${kpis.revisionRequested}`, icon: FileText, tone: kpis.revisionRequested > 0 ? "warn" : "neutral" },
          ]}
        />

        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search proposals…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading proposals…</p>}
        {!loading && error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
            Couldn't load proposals. {error}
          </p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/50 px-6 py-12 text-center">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {!search
                ? "No proposals submitted yet."
                : "No proposals match your search."}
            </p>
          </div>
        )}
        {!loading && !error && filtered.length > 0 && (
          <ProposalsTable
            proposals={filtered}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />
        )}
        {!loading && !error && filtered.length > 0 && <DataTablePagination {...pagination} />}

        {selected && (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="whitespace-normal break-words text-sm font-semibold">
                  {selected.title}
                </h3>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {selected.proposalId} · {selected.projectCode}
                </p>
              </div>
              <StatusBadge status={selected.status} />
            </div>

            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <DetailRow label="Submitted by" value={selected.submittedBy} />
              <DetailRow label="Amount" value={selected.amount} />
              <DetailRow label="Assigned reviewer" value={formatReviewer(selected.assignedReviewer)} />
              <DetailRow label="Reviewed by" value={selected.reviewerName} />
              <DetailRow label="Submitted" value={formatDate(selected.createdAt)} />
              <DetailRow label="Reviewed" value={formatDate(selected.reviewedAt)} />
            </dl>

            {selected.content && (
              <Section label="Proposal content" body={selected.content} />
            )}
            {selected.reviewComment && (
              <Section label="Review comment" body={selected.reviewComment} />
            )}
            {FEATURES.ai && selected.aiValidation && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Rule-based validation</p>
                <ProposalValidationPanel raw={selected.aiValidation} />
              </div>
            )}

            <div className="flex justify-end">
              <Button type="button" variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </PageContent>
    </PageContainer>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/50 py-1.5 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="whitespace-normal break-words text-right text-sm">
        {value || "—"}
      </dd>
    </div>
  );
}

function Section({ label, body }: { label: string; body: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="whitespace-pre-wrap break-words rounded-xl bg-muted/40 p-3 text-sm">
        {body}
      </p>
    </div>
  );
}

function formatReviewer(reviewer: string | null): string | null {
  if (!reviewer) return null;
  return reviewer.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

ProposalsRegister.displayName = "ProposalsRegister";
