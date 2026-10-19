import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatBytes } from "@/features/uploads/lib/upload-file";
import { useRevisionCompare } from "../hooks/useRevisionCompare";
import type { RevisionDetail } from "../types/revision.types";
import { RevisionFilePreview } from "./RevisionFilePreview";
import { RevisionStatusBadge } from "./RevisionBadges";
import { formatDateTime, versionText } from "../lib/revision-format";

const Row = ({ label, left, right, changed }: { label: string; left: React.ReactNode; right: React.ReactNode; changed: boolean }) => (
  <div className={`grid grid-cols-[7rem_1fr_1fr] gap-3 rounded-lg px-2 py-1.5 text-sm ${changed ? "bg-warning/10" : ""}`}>
    <div className="text-xs text-muted-foreground">
      {label}
      {changed && <span className="ml-1 text-warning-strong">changed</span>}
    </div>
    <div className="min-w-0 break-words">{left}</div>
    <div className="min-w-0 break-words">{right}</div>
  </div>
);

/**
 * Two versions of one item side by side: a metadata comparison (what changed,
 * who, when, file size, status) and previews of both files where the browser
 * can render them. It is not a visual diff of the drawings themselves.
 */
export function CompareDialog({
  leftId,
  rightId,
  onOpenChange,
}: {
  leftId: number | null;
  rightId: number | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = leftId != null && rightId != null;
  const { data, loading, error } = useRevisionCompare(leftId, rightId);

  // Older version on the left, newer on the right, whatever order was ticked.
  const [older, newer]: [RevisionDetail, RevisionDetail] | [null, null] = data
    ? data.left.versionNumber <= data.right.versionNumber
      ? [data.left, data.right]
      : [data.right, data.left]
    : [null, null];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Compare versions{older ? ` — ${older.itemTitle}` : ""}</DialogTitle>
          <DialogDescription>
            Metadata comparison with side-by-side previews. This does not highlight differences inside the drawings.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading comparison…
          </div>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-strong">
            {error}
          </p>
        )}

        {data && older && newer && (
          <div className="space-y-4">
            <div className="grid grid-cols-[7rem_1fr_1fr] gap-3 px-2 text-sm font-semibold">
              <span />
              <span>{versionText(older)}</span>
              <span>{versionText(newer)}</span>
            </div>
            <div className="space-y-0.5">
              <Row label="Status" left={<RevisionStatusBadge status={older.status} />} right={<RevisionStatusBadge status={newer.status} />} changed={data.diff.statusChanged} />
              <Row label="Change summary" left={older.changeSummary} right={newer.changeSummary} changed={data.diff.summaryChanged} />
              <Row label="Author" left={older.createdBy} right={newer.createdBy} changed={data.diff.authorChanged} />
              <Row label="Uploaded" left={formatDateTime(older.createdAt)} right={formatDateTime(newer.createdAt)} changed={false} />
              <Row
                label="File"
                left={older.fileName}
                right={newer.fileName}
                changed={!data.diff.sameFileName}
              />
              <Row
                label="Size"
                left={formatBytes(older.fileSize)}
                right={
                  <>
                    {formatBytes(newer.fileSize)}
                    {data.diff.fileSizeDelta !== 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({(newer.fileSize - older.fileSize) > 0 ? "+" : "−"}
                        {formatBytes(Math.abs(newer.fileSize - older.fileSize))})
                      </span>
                    )}
                  </>
                }
                changed={older.fileSize !== newer.fileSize}
              />
              <Row label="Review" left={older.reviewComment ?? (older.reviewedBy ? `By ${older.reviewedBy}` : "—")} right={newer.reviewComment ?? (newer.reviewedBy ? `By ${newer.reviewedBy}` : "—")} changed={false} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <RevisionFilePreview revision={older} className="h-80" />
              <RevisionFilePreview revision={newer} className="h-80" />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
