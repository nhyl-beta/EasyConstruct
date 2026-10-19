import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, Clock, GitBranch, Plus, Search, ShieldCheck, ThumbsUp, X } from "lucide-react";

import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/auth/auth-context";
import { useProjects } from "@/features/projects/hooks/useProjects";
import { CreateRevisionDialog } from "@/features/revisions/components/CreateRevisionDialog";
import { RevisionsTable } from "@/features/revisions/components/RevisionsTable";
import { VersionHistorySheet } from "@/features/revisions/components/VersionHistorySheet";
import { REVISION_PAGE_SIZES, useRevisions } from "@/features/revisions/hooks/useRevisions";
import {
  ITEM_TYPE_LABEL,
  REVISION_ITEM_TYPES,
  REVISION_STATUSES,
  type RevisionItemType,
} from "@/features/revisions/types/revision.types";

const isItemType = (v: string | null): v is RevisionItemType =>
  !!v && (REVISION_ITEM_TYPES as readonly string[]).includes(v);

export default function ArchitectRevisions() {
  const { user } = useAuth();
  const r = useRevisions();
  const { projects } = useProjects();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  // Set when "New version" is used from an item's history, to pre-fill the dialog.
  const [createFor, setCreateFor] = useState<{ projectCode: string; itemType: RevisionItemType; itemId: number } | null>(null);
  const [openItem, setOpenItem] = useState<{ itemType: RevisionItemType; itemId: number } | null>(null);

  const canCreate = user?.role === "architect" || user?.role === "admin";

  // Deep link from the Designs / Blueprints / Documentation pages:
  // /revisions?itemType=design&itemId=32 opens that item's history.
  const linkedType = params.get("itemType");
  const linkedId = Number(params.get("itemId"));
  useEffect(() => {
    if (isItemType(linkedType) && Number.isInteger(linkedId) && linkedId > 0) {
      setOpenItem({ itemType: linkedType, itemId: linkedId });
    }
  }, [linkedType, linkedId]);

  const closeHistory = (open: boolean) => {
    if (open) return;
    setOpenItem(null);
    if (params.has("itemType") || params.has("itemId")) {
      const next = new URLSearchParams(params);
      next.delete("itemType");
      next.delete("itemId");
      setParams(next, { replace: true });
    }
  };

  const firstShown = r.total === 0 ? 0 : (r.page - 1) * r.pageSize + 1;
  const lastShown = Math.min(r.page * r.pageSize, r.total);
  const s = r.summary;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Revisions"
        description="Version history across every design."
        actions={
          canCreate ? (
            <Button
              size="sm"
             
              onClick={() => {
                setCreateFor(null);
                setCreating(true);
              }}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Create revision
            </Button>
          ) : undefined
        }
      />

      <KpiStrip
        items={[
          { label: "Items tracked", value: s ? String(s.total) : "…", icon: GitBranch, hint: "current versions" },
          { label: "Awaiting review", value: s ? String(s.pending) : "…", icon: Clock, tone: s && s.pending > 0 ? "warn" : "neutral" },
          { label: "Under review", value: s ? String(s.underReview) : "…", icon: ShieldCheck },
          {
            label: "Approved",
            value: s ? String(s.approved) : "…",
            icon: ThumbsUp,
            tone: "good",
            hint: s ? `${s.rejected} rejected` : undefined,
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2" role="search" aria-label="Filter revisions">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={r.query}
            onChange={(e) => r.setQuery(e.target.value)}
            placeholder="Search title, label or summary…"
            aria-label="Search revisions"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select value={r.filters.project} onValueChange={(v) => r.setFilter("project", v)}>
          <SelectTrigger aria-label="Filter by project" className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.code} value={p.code}>
                {p.code} · {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={r.filters.itemType} onValueChange={(v) => r.setFilter("itemType", v)}>
          <SelectTrigger aria-label="Filter by type" className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {REVISION_ITEM_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {ITEM_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={r.filters.status} onValueChange={(v) => r.setFilter("status", v)}>
          <SelectTrigger aria-label="Filter by status" className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {REVISION_STATUSES.map((st) => (
              <SelectItem key={st} value={st}>
                {st}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="w-36">
          <DatePicker value={r.filters.dateFrom} onChange={(v) => r.setFilter("dateFrom", v)} placeholder="From date" max={r.filters.dateTo || undefined} />
        </div>
        <div className="w-36">
          <DatePicker value={r.filters.dateTo} onChange={(v) => r.setFilter("dateTo", v)} placeholder="To date" min={r.filters.dateFrom || undefined} />
        </div>
        {r.hasActiveFilters && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={r.clearFilters}>
            <X className="h-3 w-3" /> Clear
          </Button>
        )}
      </div>

      {r.error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive-strong">
          <span>Couldn't load revisions. {r.error}</span>
          <Button size="sm" variant="outline" onClick={() => void r.reload()}>
            Retry
          </Button>
        </div>
      ) : r.loading && r.rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">Loading revisions…</div>
      ) : r.total === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {r.hasActiveFilters ? (
            <p>No revisions match these filters.</p>
          ) : (
            <div className="space-y-3">
              <p>No revisions recorded yet.</p>
              {canCreate && (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Create revision
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border">
          <div className="[&_[data-slot=table-container]]:overflow-x-hidden">
            <RevisionsTable rows={r.rows} onOpen={(row) => setOpenItem({ itemType: row.itemType, itemId: row.itemId })} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                Showing {firstShown}–{lastShown} of {r.total}
              </span>
              <Select value={String(r.pageSize)} onValueChange={(v) => r.setPageSize(Number(v))}>
                <SelectTrigger aria-label="Rows per page" className="h-7 w-24 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVISION_PAGE_SIZES.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={r.page <= 1} onClick={() => r.setPage(r.page - 1)} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="tabular-nums">
                Page {r.page} of {r.pages}
              </span>
              <Button size="sm" variant="outline" className="h-7 px-2" disabled={r.page >= r.pages} onClick={() => r.setPage(r.page + 1)} aria-label="Next page">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <VersionHistorySheet
        item={openItem}
        onOpenChange={closeHistory}
        onChanged={() => void r.reload()}
        onNewVersion={
          canCreate
            ? (item, projectCode) => {
                setCreateFor({ projectCode, ...item });
                setCreating(true);
              }
            : undefined
        }
      />
      <CreateRevisionDialog
        open={creating}
        onOpenChange={setCreating}
        initial={createFor}
        onCreated={(created) => {
          void r.reload();
          setOpenItem({ itemType: created.itemType, itemId: created.itemId });
        }}
      />
    </div>
  );
}

ArchitectRevisions.displayName = "ArchitectRevisions";
