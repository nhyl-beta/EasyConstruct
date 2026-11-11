import { ProposalStatusFilter } from "./ProposalStatusFilter";
import { useCallback, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, Search } from "lucide-react";

import { SplitDetailLayout } from "@/components/detail-panel/DetailPanel";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Input } from "@/components/ui/input";
import { useSelectedParam } from "@/hooks/use-selected-param";
import { ProposalDetailPanel } from "../ProposalDetailPanel";
import { useProposals } from "../hooks/useProposals";
import { ProposalsTable } from "./ProposalsTable";

interface ProposalsRegisterProps {
  title: string;
  description: string;
  /** False removes the column sort buttons (rows stay in ascending Proposal ID order). Default true. */
  sortable?: boolean;
}

/** The read-only proposals register (Owner, IT Designer): list on the left, details in a right-hand panel. */
export function ProposalsRegister({ title, description, sortable = true }: ProposalsRegisterProps) {
  const { proposals, loading, error, kpis, query: search, setQuery: setSearch, status, setStatus, pagination } = useProposals();
  const [selectedId, select] = useSelectedParam();
  const [order, setOrder] = useState<number[]>([]);

  const selected = proposals.find((p) => String(p.id) === selectedId) ?? null;
  const close = useCallback(() => select(null), [select]);
  const step = useCallback(
    (delta: 1 | -1) => {
      if (order.length === 0) return;
      const at = order.findIndex((id) => String(id) === selectedId);
      const next = order[Math.min(order.length - 1, Math.max(0, at + delta))];
      if (next !== undefined) select(next);
    },
    [order, selectedId, select],
  );

  return (
    <PageContainer>
      <PageHeader title={title} description={description} />
      <PageContent className="space-y-6 p-6 md:p-8">
        <KpiStrip
          items={[
            { label: "Total proposals", value: `${kpis.total}`, icon: FileText },
            { label: "Pending review", value: `${kpis.pending}`, icon: FileText, tone: kpis.pending > 0 ? "warn" : "neutral" },
            { label: "Approved", value: `${kpis.approved}`, icon: CheckCircle2, tone: "good" },
            { label: "Failed validation", value: `${kpis.failedValidation}`, icon: AlertTriangle, tone: kpis.failedValidation > 0 ? "warn" : "neutral" },
          ]}
        />

        <SplitDetailLayout
          open={!!selected}
          onClose={close}
          onStep={step}
          sheetLabel="Proposal details"
          panel={({ inSheet }) =>
            selected && (
              <ProposalDetailPanel proposal={selected} siblings={proposals} onSelectRelated={(p) => select(p.id)} onClose={close} inSheet={inSheet} />
            )
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-56 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search proposals…" aria-label="Search proposals" className="h-9 pl-9 text-xs" />
              </div>
              <ProposalStatusFilter value={status} onChange={setStatus} />
            </div>

            {loading && <p className="text-sm text-muted-foreground">Loading proposals…</p>}
            {!loading && error && (
              <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">Couldn't load proposals. {error}</p>
            )}
            {!loading && !error && proposals.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/50 px-6 py-12 text-center">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{!search ? "No proposals submitted yet." : "No proposals match your search."}</p>
              </div>
            )}
            {!loading && !error && proposals.length > 0 && (
              <ProposalsTable proposals={proposals} selectedId={selected?.id ?? null} onSelect={(p) => select(p.id)} onOrderChange={setOrder} sortable={sortable} />
            )}
            {!loading && !error && proposals.length > 0 && <DataTablePagination {...pagination} />}
          </div>
        </SplitDetailLayout>
      </PageContent>
    </PageContainer>
  );
}

ProposalsRegister.displayName = "ProposalsRegister";
