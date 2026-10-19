import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useDesignDetail } from "@/features/designs/hooks/useDesignDetail";
import { RevisionLink } from "@/features/revisions/components/RevisionLink";
import { useCurrentRevisions } from "@/features/revisions/hooks/useCurrentRevisions";
import { useDesignReviews } from "@/features/design-reviews/hooks/useDesignReviews";
import { useAuth } from "@/auth/auth-context";
import { ChevronLeft, Eye, MessageSquareQuote, Trash2 } from "lucide-react";
import { CreateRequestDialog } from "@/features/requests/components/CreateRequestDialog";
import { ImpactAwarenessCard } from "@/features/lifecycle/components/ImpactAwarenessCard";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function ArchitectDesignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const c = useDesignDetail(id!);
  const currentRevisions = useCurrentRevisions("design");
  const { user } = useAuth();
  const { reviews, create: createReview } = useDesignReviews();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [requestingReview, setRequestingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [raisingRfi, setRaisingRfi] = useState(false);
  // Only the PM and Engineers raise RFIs/RFAs; designers answer them.
  const canRaiseRequest = user?.role === "project-manager" || user?.role === "engineer" || user?.role === "admin";

  // C2 follow-up: "Request review" previously only existed as a dialog
  // buried in the Architect Dashboard's Quick Actions, not reachable from
  // the page a reviewer's D2 gate link ("Go to designs") actually lands on
  // — a design could sit in Draft indefinitely with no in-context way to
  // send it for review. `reviews` is the full list (no designId filter on
  // the API), so it's narrowed here to this one design. Hooks must run
  // unconditionally on every render, so this has to sit above the
  // loading/error early returns below rather than after them.
  const designId = c.design?.id;
  const pendingReview = useMemo(
    () => reviews.find((r) => r.designId === designId && (r.status === "Pending" || r.status === "Changes Requested")),
    [reviews, designId],
  );

  if (c.loading) {
    return (
      <div className="space-y-4 p-4 md:p-8">
        <PageHeader title="Design" breadcrumbLabel="Design" description="Loading design…" />
      </div>
    );
  }

  if (c.error || !c.design) {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-8">
        <PageHeader title="Design not found" breadcrumbLabel="Design" />
        <Button
          variant="ghost"
          size="sm"
         
          onClick={() => navigate("/designs")}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> All designs
        </Button>
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {c.error ?? "Design not found."}
        </div>
      </div>
    );
  }

  const d = c.design;

  const handleDelete = async () => {
    const ok = await c.remove();
    if (ok) navigate("/designs");
  };

  const handleRequestReview = async () => {
    if (!d) return;
    setRequestingReview(true);
    setReviewError(null);
    try {
      await createReview({
        code: `REV-${d.code}-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
        designId: d.id,
        requestedBy: user?.name ?? "Architect",
      });
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Failed to request review.");
    } finally {
      setRequestingReview(false);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <Button
        variant="ghost"
        size="sm"
        className="-mb-2"
        onClick={() => navigate("/designs")}
      >
        <ChevronLeft className="mr-1 h-4 w-4" /> All designs
      </Button>

      <PageHeader
        title={d.name}
        breadcrumbLabel={d.name}
        description={`${d.code} · ${d.projectCode}`}
        actions={
          <>
            <RevisionLink itemType="design" itemId={d.id} current={currentRevisions[d.id]} />
            {canRaiseRequest && (
              <Button size="sm" variant="outline" onClick={() => setRaisingRfi(true)}>
                <MessageSquareQuote className="mr-1 h-3.5 w-3.5" /> Raise RFI
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="text-destructive-strong"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
            </Button>
            {d.status !== "Approved" && (
              <Button
                size="sm"
               
                disabled={requestingReview || !!pendingReview}
                title={pendingReview ? "A review is already pending for this design" : undefined}
                onClick={handleRequestReview}
              >
                <Eye className="mr-1 h-3.5 w-3.5" />
                {pendingReview ? "Review pending" : requestingReview ? "Sending…" : "Request review"}
              </Button>
            )}
            <StatusBadge status={d.status} />
          </>
        }
      />

      {reviewError && (
        <p className="text-sm text-destructive-strong">{reviewError}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Design details" className="lg:col-span-2">
          <dl className="grid gap-4 md:grid-cols-2">
            <Field label="Discipline" value={d.discipline} />
            <Field label="Category" value={d.category} />
            <Field label="Phase" value={d.phase} />
            <Field label="Version" value={`${d.version} · rev ${d.revision}`} />
            <Field label="Lead architect" value={d.leadArchitect} />
            <Field label="Client" value={d.client ?? "—"} />
            <Field label="Building" value={d.building ?? "—"} />
            <Field label="Floor" value={d.floor ?? "—"} />
            <Field label="Zone" value={d.zone ?? "—"} />
            <Field label="Files" value={`${d.fileCount}`} />
          </dl>
          {d.description && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Description
              </div>
              <p className="mt-1 text-sm">{d.description}</p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Read-only advisories for this design's project (cost, change, schedule, quality). */}
      <ImpactAwarenessCard projectCode={d.projectCode} />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete design "${d.name}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete design"
        loading={c.deleting}
        onConfirm={handleDelete}
      />
      <CreateRequestDialog
        open={raisingRfi}
        onOpenChange={setRaisingRfi}
        initial={{ projectCode: d.projectCode, designId: d.id, kind: "RFI", subject: `${d.name}: ` }}
        onCreated={() => navigate("/requests")}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-overline uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

ArchitectDesignDetail.displayName = "ArchitectDesignDetail";
