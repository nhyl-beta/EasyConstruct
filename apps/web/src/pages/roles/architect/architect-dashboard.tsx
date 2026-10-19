import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useArchitectDashboardController } from "@/features/dashboard/controllers/architect-dashboard.controller";
import { WaitingOnYouCard } from "@/features/lifecycle/components/WaitingOnYouCard";
import { ImpactAwarenessCard } from "@/features/lifecycle/components/ImpactAwarenessCard";
import { useAuth } from "@/auth/auth-context";
import { useDesignReviews } from "@/features/design-reviews/hooks/useDesignReviews";
import {
  CheckSquare,
  FileText,
  GitCompare,
  Library,
  PencilRuler,
  Plus,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { useRevisionSummary } from "@/features/revisions/hooks/useRevisionSummary";
import { useNavigate } from "react-router";

export default function ArchitectDashboard() {
  const navigate = useNavigate();
  const revisionSummary = useRevisionSummary();
  const c = useArchitectDashboardController();
  const { user } = useAuth();
  const { create } = useDesignReviews({ autoLoad: false });
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedDesignId, setSelectedDesignId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submitReviewRequest = async () => {
    if (!selectedDesignId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const design = c.recentDesigns.find((d) => String(d.id) === selectedDesignId);
      await create({
        code: `REV-${(design?.code ?? selectedDesignId)}-${Date.now().toString(36).toUpperCase()}`.slice(0, 20),
        designId: Number(selectedDesignId),
        requestedBy: user?.name ?? "Architect",
      });
      setReviewDialogOpen(false);
      setSelectedDesignId("");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to request review.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Design Studio"
        description="Your workspace for designs, proposals, and review activity."
        actions={
          <Button
            size="sm"
           
            onClick={() => navigate("/designs/new")}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            New design
          </Button>
        }
      />

      <KpiStrip
        items={[
          {
            label: "Total designs",
            value: `${c.kpis.total}`,
            icon: PencilRuler,
          },
          {
            label: "In review",
            value: `${c.kpis.inReview}`,
            icon: CheckSquare,
            tone: "warn",
          },
          {
            label: "Approved",
            value: `${c.kpis.approved}`,
            icon: CheckSquare,
            tone: "good",
          },
          {
            label: "Pending proposals",
            value: `${c.proposalKpis.pending}`,
            icon: FileText,
            tone: "warn",
          },
        ]}
      />

      {/* K1: cross-project gate checks + workflow stages waiting on this architect */}
      <WaitingOnYouCard />

      <ImpactAwarenessCard />

      <div className="grid gap-4">
        <SectionCard title="Active designs" subtitle="Most recently updated">
          {c.loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : c.recentDesigns.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No designs yet.
            </div>
          ) : (
            <div className="space-y-2">
              {c.recentDesigns.map((d) => (
                <button
                  key={d.id}
                  onClick={() => navigate(`/designs/${d.id}`)}
                  className="flex w-full items-center justify-between rounded-xl border p-3 text-left transition hover:border-primary/40 hover:bg-muted/30"
                >
                  <div>
                    <div className="text-sm font-medium">{d.name}</div>
                    <div className="text-overline text-muted-foreground">
                      {d.code} · rev {d.revision}
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a design review</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="review-design">Design</Label>
            <Select value={selectedDesignId} onValueChange={setSelectedDesignId}>
              <SelectTrigger id="review-design">
                <SelectValue placeholder="Pick a design to send" />
              </SelectTrigger>
              <SelectContent>
                {c.recentDesigns.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name} · {d.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {submitError && (
              <p className="text-sm text-destructive-strong">{submitError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={submitReviewRequest}
              disabled={!selectedDesignId || submitting}
            >
              {submitting ? "Sending…" : "Send for review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SectionCard title="Quick links" subtitle="Jump to your working pages">
        <div className="grid gap-3 md:grid-cols-3">
          <QuickAction
            icon={Library}
            label="Blueprints"
            description="Drawings and their review status"
            onClick={() => navigate("/blueprints")}
          />
          <QuickAction
            icon={GitCompare}
            label="Revisions"
            description={
              revisionSummary
                ? `${revisionSummary.pending} awaiting review · ${revisionSummary.underReview} under review`
                : "Design revisions and history"
            }
            onClick={() => navigate("/revisions")}
          />
          <QuickAction
            icon={FileText}
            label="Documentation"
            description="Specifications, permits and as-built documents"
            onClick={() => navigate("/architect/documents")}
          />
        </div>
      </SectionCard>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  description,
  onClick,
  disabled,
}: {
  icon: typeof Upload;
  label: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border bg-background p-3 text-left text-sm transition enabled:hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-overline text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}

ArchitectDashboard.displayName = "ArchitectDashboard";
