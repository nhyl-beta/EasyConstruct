import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useState } from "react";
import { CheckCircle2, Download, Eye, GitCompare, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes } from "@/features/uploads/lib/upload-file";
import { downloadRevision } from "../lib/revision-file";
import type { Revision, RevisionStatus } from "../types/revision.types";
import { RevisionStatusBadge } from "./RevisionBadges";
import { formatDateTime, versionText } from "../lib/revision-format";

interface Props {
  versions: Revision[];
  /** Consultant / PM / Admin only: show decision buttons on the current version. */
  canReview?: boolean;
  saving?: boolean;
  actionError?: string | null;
  onReview?: (id: number, status: RevisionStatus, comment?: string) => Promise<boolean>;
  onPreview: (revision: Revision) => void;
  /** Ids ticked for comparison (at most two) and the toggle. */
  selected?: number[];
  onToggleSelect?: (id: number) => void;
}

/** Timeline of every version, newest first, with the current one highlighted. */
export function VersionHistory({ versions, canReview, saving, actionError, onReview, onPreview, selected = [], onToggleSelect }: Props) {
  const [reviewing, setReviewing] = useState<{ id: number; status: RevisionStatus } | null>(null);
  const [comment, setComment] = useState("");
  const pg = usePagination(versions, 8);

  const submitReview = async () => {
    if (!reviewing || !onReview) return;
    if (reviewing.status === "Rejected" && !comment.trim()) return;
    const ok = await onReview(reviewing.id, reviewing.status, comment.trim() || undefined);
    if (ok) {
      setReviewing(null);
      setComment("");
    }
  };

  return (
    <ol className="relative space-y-4 border-l border-border pl-5" aria-label="Version history">
      {pg.pageItems.map((v) => (
        <li key={v.id} className="relative">
          <span
            aria-hidden="true"
            className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-background ${v.isCurrent ? "bg-primary" : "bg-muted-foreground/40"}`}
          />
          <div className={`space-y-2 rounded-xl border p-3 ${v.isCurrent ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{versionText(v)}</span>
                {v.isCurrent && <Badge className="rounded-full px-2 py-0 text-overline">Current</Badge>}
                <RevisionStatusBadge status={v.status} />
              </div>
              {onToggleSelect && (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Checkbox
                    checked={selected.includes(v.id)}
                    disabled={!selected.includes(v.id) && selected.length >= 2}
                    onCheckedChange={() => onToggleSelect(v.id)}
                    aria-label={`Select ${versionText(v)} to compare`}
                  />
                  <GitCompare className="h-3 w-3" /> Compare
                </label>
              )}
            </div>

            <p className="text-sm">{v.changeSummary}</p>
            <p className="text-xs text-muted-foreground">
              {v.createdBy} · {formatDateTime(v.createdAt)} · {v.fileName} ({formatBytes(v.fileSize)})
            </p>

            {(v.reviewedBy || v.reviewComment) && (
              <div className="rounded-lg bg-muted/50 p-2 text-xs">
                <p className="font-medium">
                  {v.status === "Rejected" ? "Rejected" : v.status === "Approved" ? "Approved" : "Reviewed"} by {v.reviewedBy ?? "reviewer"}
                  {v.reviewedAt ? ` · ${formatDateTime(v.reviewedAt)}` : ""}
                </p>
                {v.reviewComment && <p className="mt-0.5 text-muted-foreground">{v.reviewComment}</p>}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onPreview(v)}>
                <Eye className="h-3 w-3" /> Preview
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => downloadRevision(v).catch((e: Error) => toast.error(e.message))}
              >
                <Download className="h-3 w-3" /> Download
              </Button>
              {canReview && onReview && v.isCurrent && (v.status === "Submitted" || v.status === "Under Review") && (
                <>
                  {v.status === "Submitted" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={saving} onClick={() => void onReview(v.id, "Under Review")}>
                      Start review
                    </Button>
                  )}
                  <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => setReviewing({ id: v.id, status: "Approved" })}>
                    <CheckCircle2 className="h-3 w-3" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={saving} onClick={() => setReviewing({ id: v.id, status: "Rejected" })}>
                    <XCircle className="h-3 w-3" /> Reject
                  </Button>
                </>
              )}
            </div>

            {reviewing?.id === v.id && (
              <div className="space-y-2 rounded-lg border p-2">
                <label htmlFor={`review-comment-${v.id}`} className="text-xs font-medium">
                  {reviewing.status === "Rejected" ? "Reason for rejecting (required)" : "Comment (optional)"}
                </label>
                <Textarea id={`review-comment-${v.id}`} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={saving || (reviewing.status === "Rejected" && !comment.trim())}
                    onClick={() => void submitReview()}
                  >
                    Confirm {reviewing.status === "Rejected" ? "rejection" : "approval"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReviewing(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {actionError && reviewing?.id === v.id && (
              <p role="alert" className="text-xs text-destructive-strong">
                {actionError}
              </p>
            )}
          </div>
        </li>
      ))}
      <li className="list-none pt-2">
        <DataTablePagination {...pg} compact />
      </li>
    </ol>
  );
}
