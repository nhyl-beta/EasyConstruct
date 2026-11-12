import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useState } from "react";
import { toast } from "sonner";
import type { Design } from "../types/design.types";
import { DesignFileLinks } from "./DesignFileLinks";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-sm">{children}</dd>
  </div>
);

/**
 * Design detail for the Consultant register: no editing, and no link into the
 * Architect's editable design page. The only action is the review decision.
 */
export function DesignDetailDialog({
  design,
  onOpenChange,
  onReview,
}: {
  design: Design | null;
  onOpenChange: (open: boolean) => void;
  /** Consultant's decision on a design that is In Review; the dialog closes once it is saved. */
  onReview?: (design: Design, decision: "Approved" | "Changes Requested" | "Rejected") => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const decide = async (decision: "Approved" | "Changes Requested" | "Rejected") => {
    if (!design || !onReview) return;
    setBusy(true);
    try {
      await onReview(design, decision);
      toast.success(`Design marked ${decision === "Approved" ? "Approved" : "Revision Required"}`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the review");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={design !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {design && (
          <>
            <DialogHeader>
              <DialogTitle>{design.name}</DialogTitle>
              <DialogDescription className="font-mono text-xs">{design.code}</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Project">{design.projectCode}</Field>
              <Field label="Status">
                <StatusBadge status={design.status} />
              </Field>
              <Field label="Discipline">{design.discipline}</Field>
              <Field label="Phase">{design.phase || "—"}</Field>
              <Field label="Version">
                {design.version} · rev {design.revision}
              </Field>
              <Field label="Lead architect">{design.leadArchitect}</Field>
              <div className="col-span-2">
                <Field label="Assigned engineers">
                  {design.assignedEngineers?.length
                    ? design.assignedEngineers.map((e) => e.userName).join(", ")
                    : "—"}
                </Field>
              </div>
            </dl>
            <div>
              <div className="text-xs text-muted-foreground">Description</div>
              <p className="whitespace-pre-line text-sm">{design.description?.trim() || "—"}</p>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Files</div>
              <DesignFileLinks files={design.fileUrls} />
            </div>
            {onReview && design.status === "In Review" && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <span className="mr-1 text-xs font-medium text-muted-foreground">Mark as reviewed:</span>
                <Button size="sm" disabled={busy} onClick={() => decide("Approved")}>Approve</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("Changes Requested")}>Request changes</Button>
                <Button size="sm" variant="destructive" disabled={busy} onClick={() => decide("Rejected")}>Reject</Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
