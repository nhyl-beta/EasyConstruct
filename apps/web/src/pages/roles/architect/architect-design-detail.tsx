import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useDesignDetail } from "@/features/designs/hooks/useDesignDetail";
import { RevisionLink } from "@/features/revisions/components/RevisionLink";
import { useCurrentRevisions } from "@/features/revisions/hooks/useCurrentRevisions";
import { useDesignReviews } from "@/features/design-reviews/hooks/useDesignReviews";
import { useAuth } from "@/auth/auth-context";
import { Eye, MessageSquareQuote, Trash2 } from "lucide-react";
import { CreateRequestDialog } from "@/features/requests/components/CreateRequestDialog";
import { ImpactAwarenessCard } from "@/features/lifecycle/components/ImpactAwarenessCard";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FileIntegrityBadge } from "@/features/uploads/components/FileIntegrityBadge";
import { downloadFileUrl } from "@/lib/file-url";
import { toast } from "sonner";

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
  // IT Designer only looks: no Delete or Request review (the API refuses them anyway); files stay downloadable.
  const readOnly = user?.role === "it-designer";
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
    // A review already sent back for changes is decided, not pending: once the revision goes in, the architect asks again.
    () => reviews.find((r) => r.designId === designId && r.status === "Pending"),
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
        // 20 characters at most; the design is linked by id, so the code only has to be unique
        code: `REV-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
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
      {/* B-57/B-155: this back-link duplicated the PageHeader's own
          breadcrumb (Home > Designs > this design) below — removed rather
          than kept in sync with it. */}
      {c.deleteError && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
          Couldn't delete this design. {c.deleteError}
        </p>
      )}

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
            {!readOnly && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive-strong"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </Button>
            )}
            {!readOnly && d.status !== "Approved" && (
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

      {/* B-58/B-156: was a 3-col grid holding one 2-col card, leaving a dead
          column and a narrower card than the full-width ImpactAwarenessCard
          below it. Only one card here — no grid needed. */}
      <SectionCard title="Design details">
        <dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
        {(d.fileUrls ?? []).length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-border pt-4">
            {(d.fileUrls ?? []).map((f) => (
              <li key={f.url} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{f.name}</span>
                  <FileIntegrityBadge url={f.url} />
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs text-primary-strong hover:underline"
                  onClick={() => void downloadFileUrl(f.url, f.name).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not download the file"))}
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        )}
        {d.description && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Description
            </div>
            <p className="mt-1 text-sm">{d.description}</p>
          </div>
        )}
      </SectionCard>

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
