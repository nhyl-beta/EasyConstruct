import { Download, FileWarning, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { previewKind, downloadRevision, useRevisionFileUrl } from "../lib/revision-file";
import type { Revision } from "../types/revision.types";

/**
 * Shows a revision's file where the browser can render it (images, PDFs);
 * every other type shows its details and a download button. This is a preview
 * only — there is no visual diff.
 */
export function RevisionFilePreview({ revision, className = "h-72" }: { revision: Revision; className?: string }) {
  const { url, loading, error, renderable } = useRevisionFileUrl(revision);
  const kind = previewKind(revision);

  const download = () => downloadRevision(revision).catch((e: Error) => toast.error(e.message));

  if (!renderable) {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground ${className}`}>
        <FileWarning className="h-5 w-5" />
        <p>No inline preview for {revision.fileName.split(".").pop()?.toUpperCase() ?? "this"} files.</p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void download()}>
          <Download className="h-3 w-3" /> Download
        </Button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className={`flex items-center justify-center gap-2 rounded-lg border text-xs text-muted-foreground ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
      </div>
    );
  }
  if (error || !url) {
    return (
      <div role="alert" className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 p-4 text-center text-xs text-destructive-strong ${className}`}>
        <p>{error ?? "The preview could not be loaded."}</p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void download()}>
          <Download className="h-3 w-3" /> Download instead
        </Button>
      </div>
    );
  }
  return kind === "image" ? (
    <div className={`flex items-center justify-center overflow-hidden rounded-lg border bg-muted/30 ${className}`}>
      <img src={url} alt={`${revision.itemTitle} — version ${revision.versionNumber}`} className="max-h-full max-w-full object-contain" />
    </div>
  ) : (
    <iframe title={`${revision.itemTitle} — version ${revision.versionNumber}`} src={url} className={`w-full rounded-lg border ${className}`} />
  );
}
