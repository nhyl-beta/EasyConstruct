// apps/web/src/pages/roles/shared/shared-blueprint-reviews.tsx — NEW (Part B item 8)
//
// Gate D3 ("Approved current blueprint") reads blueprints.approval, but
// before this there was no UI path to set it except the architect's own
// generic PATCH on architect-blueprints.tsx — the wrong actor deciding
// their own submission, and not even a visible action there (that page has
// no decide UI at all, only create). Mirrors consultant-design-reviews.tsx:
// a real Approve / Request changes / Reject action, gated server-side to
// consultant/project-manager/admin (apps/api/src/blueprints/routes.ts).
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useMemo, useState } from "react";
import { Check, FileCheck2, Send, X } from "lucide-react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useBlueprints } from "@/features/blueprint/hooks/useBlueprints";
import { useAuth } from "@/auth/auth-context";

type Tab = "pending" | "approved" | "other";

const APPROVAL_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  Approved: "default",
  Rejected: "destructive",
  "Revision Required": "secondary",
  Draft: "outline",
  "Pending Review": "outline",
};

export default function SharedBlueprintReviewsPage() {
  const { user } = useAuth();
  const canDecide = user?.role === "consultant" || user?.role === "project-manager" || user?.role === "admin";
  const { blueprints, loading, decide, deciding, decideError } = useBlueprints();
  const [tab, setTab] = useState<Tab>("pending");

  const filtered = useMemo(() => {
    if (tab === "pending") {
      return blueprints.filter((b) => b.approval !== "Approved" && b.approval !== "Rejected");
    }
    if (tab === "approved") return blueprints.filter((b) => b.approval === "Approved");
    return blueprints.filter((b) => b.approval === "Rejected" || b.approval === "Revision Required");
  }, [blueprints, tab]);
  const pg = usePagination(filtered, 10, tab);

  return (
    <PageContainer>
      <PageHeader
        title="Blueprint reviews"
        description={
          canDecide
            ? "Blueprints awaiting your approval — Pre-Construction/Design gate D3 needs an approved, current blueprint on file."
            : "Blueprints and their approval status."
        }
      />
      <PageContent className="space-y-4 p-6 md:p-8">
        {decideError && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive-strong">
            {decideError}
          </p>
        )}
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="other">Rejected / Revisions</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="mt-4">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading blueprints…</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                No blueprints in this bucket.
              </div>
            ) : (
              <div className="space-y-2">
                {pg.pageItems.map((b) => (
                  <div key={b.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCheck2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{b.title}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {b.drawingNumber} · {b.folder} · by {b.author}
                            {b.projectCode ? ` · ${b.projectCode}` : ""}
                          </div>
                        </div>
                      </div>
                      <Badge variant={APPROVAL_TONE[b.approval] ?? "outline"}>{b.approval}</Badge>
                    </div>
                    {canDecide && tab === "pending" && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                        <span className="mr-1 text-xs font-medium text-muted-foreground">Decide:</span>
                        <Button
                          size="sm"
                         
                          disabled={deciding}
                          onClick={() => decide(b.id, "Approved")}
                        >
                          <Check className="h-4 w-4" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                         
                          disabled={deciding}
                          onClick={() => decide(b.id, "Revision Required")}
                        >
                          <Send className="h-4 w-4" /> Request changes
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                         
                          disabled={deciding}
                          onClick={() => decide(b.id, "Rejected")}
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
      </PageContent>
    </PageContainer>
  );
}

SharedBlueprintReviewsPage.displayName = "SharedBlueprintReviewsPage";
