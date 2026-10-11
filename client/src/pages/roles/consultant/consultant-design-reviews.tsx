import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Check, X, Send } from "lucide-react";
import { useDesignReviews } from "@/features/design-reviews/hooks/useDesignReviews";
import { SubmittedFiles } from "@/components/shared/submitted-files";
import { VersionHistorySheet } from "@/features/revisions/components/VersionHistorySheet";
import { RevisionStatusBadge } from "@/features/revisions/components/RevisionBadges";
import { versionText } from "@/features/revisions/lib/revision-format";
import { useCurrentRevisions } from "@/features/revisions/hooks/useCurrentRevisions";
import type { RevisionItemType } from "@/features/revisions/types/revision.types";
import { useState } from "react";
import { GitBranch } from "lucide-react";
import { fileTypeLabel } from "@/lib/file-type-label";

// E1/E2: deciding a design review (Approved/Rejected/Changes Requested) is
// the Consultant's call, enforced server-side (design-reviews/routes.ts:
// requireRole("consultant","project-manager","admin")). This page used to
// be "architect-reviews.tsx" mounted at /reviews for the Architect — the
// architect reviewing their own design's approval made no sense and, after
// the server guard was added, would just 403. The decide UI itself needed
// no changes, so it moved here rather than being rebuilt.
export default function ConsultantDesignReviews() {
  const c = useDesignReviews();
  const pg = usePagination(c.filtered, 10, c.tab);
  const currentRevisions = useCurrentRevisions("design");
  const [revisionsOf, setRevisionsOf] = useState<{ itemType: RevisionItemType; itemId: number } | null>(null);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader title="Design reviews" description="Design reviews awaiting your decision." />

      <Tabs value={c.tab} onValueChange={(v) => c.setTab(v as typeof c.tab)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value={c.tab} className="mt-4">
          {c.loading ? (
            <div className="text-sm text-muted-foreground">Loading reviews…</div>
          ) : c.filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No reviews in this bucket.
            </div>
          ) : (
            <div className="space-y-2">
              {pg.pageItems.map((r) => (
                <div key={r.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                      <span className="ml-2 text-sm font-medium">
                        {c.designsById[r.designId]?.name ?? `Design #${r.designId}`}
                      </span>
                      {c.designsById[r.designId] && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {c.designsById[r.designId]!.projectCode}
                        </span>
                      )}
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  {currentRevisions[r.designId] && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Latest revision:</span>
                      <span className="font-medium">{versionText(currentRevisions[r.designId]!)}</span>
                      <RevisionStatusBadge status={currentRevisions[r.designId]!.status} />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 px-2 text-xs"
                        onClick={() => setRevisionsOf({ itemType: "design", itemId: r.designId })}
                      >
                        <GitBranch className="h-3 w-3" /> Version history
                      </Button>
                    </div>
                  )}
                  <div className="mt-2">
                    <SubmittedFiles
                      compact
                      emptyText="No files attached to this design."
                      files={(c.designsById[r.designId]?.fileUrls ?? []).map((f) => ({
                        key: f.url,
                        name: f.name,
                        url: f.url,
                        meta: fileTypeLabel(f.name),
                      }))}
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-overline text-muted-foreground">
                    <span>{r.discipline ?? "—"}</span>
                    <span>·</span>
                    <span>{r.reviewers ?? "Unassigned"}</span>
                    <span>·</span>
                    <span>Due {r.dueDate ?? "—"}</span>
                  </div>
                  {c.tab === "pending" && (
                    // Part B item 1: these were 28px-tall, low-contrast
                    // buttons (a ghost-variant destructive Reject blended
                    // into the row entirely) — a real action a consultant
                    // couldn't tell was clickable. Full-size, clearly
                    // hierarchical buttons with a "Decide:" label instead.
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                      <span className="mr-1 text-xs font-medium text-muted-foreground">Decide:</span>
                      <Button size="sm" onClick={() => c.decide(r.id, "Approved")}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => c.decide(r.id, "Changes Requested")}>
                        <Send className="h-4 w-4" /> Request changes
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                       
                        onClick={() => c.decide(r.id, "Rejected")}
                      >
                        <X className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              <div className="pt-2">
                <DataTablePagination {...pg} />
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <VersionHistorySheet item={revisionsOf} onOpenChange={(open) => !open && setRevisionsOf(null)} />
    </div>
  );
}

ConsultantDesignReviews.displayName = "ConsultantDesignReviews";
