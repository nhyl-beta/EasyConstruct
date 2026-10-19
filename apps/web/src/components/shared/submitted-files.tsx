// apps/web/src/components/shared/submitted-files.tsx
//
// One list of "files submitted for review", used by the Consultant's proposal
// review (files the Architect submitted with the proposal) and design review
// (files attached to the design). Each row shows name, type and size and opens
// the same in-app preview / download dialog as every other document surface.
import { useState } from "react";
import { FileText, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilePreviewDialog } from "@/components/shared/file-preview-dialog";
import { isRealFileUrl } from "@/lib/file-url";
import { FileIntegrityBadge } from "@/features/uploads/components/FileIntegrityBadge";

export interface SubmittedFile {
  key: string | number;
  name: string;
  url: string | null;
  /** Free text under the name, e.g. "PDF · 2.4 MB · Ana Villanueva". */
  meta?: string;
  /** Set when the file's bytes are gone: shown under the name and the View button is off. */
  unavailableNote?: string;
}

export function SubmittedFiles({
  files,
  loading = false,
  error = null,
  emptyText,
  compact = false,
  onRetry,
}: {
  files: SubmittedFile[];
  loading?: boolean;
  error?: string | null;
  emptyText: string;
  compact?: boolean;
  /** Shown as a Retry button next to a load error. */
  onRetry?: () => void;
}) {
  const [preview, setPreview] = useState<SubmittedFile | null>(null);

  if (loading) return <p className="text-sm text-muted-foreground">Loading files…</p>;
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive-strong">
        <span>{error}</span>
        {onRetry && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }
  if (files.length === 0) return <p className="text-xs text-muted-foreground">{emptyText}</p>;

  return (
    <>
      <ul className="space-y-2">
        {files.map((file) => (
          <li
            key={file.key}
            className={`flex items-start gap-3 rounded-lg border border-border ${compact ? "p-2" : "p-3"}`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/60 text-secondary-foreground">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{file.name}</p>
              {file.meta && <p className="mt-0.5 text-xs text-muted-foreground">{file.meta}</p>}
              {file.url && <FileIntegrityBadge url={file.url} className="mt-1" />}
              {file.unavailableNote && <p className="mt-0.5 text-xs text-warning-strong">{file.unavailableNote}</p>}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-xs"
              disabled={!isRealFileUrl(file.url) || !!file.unavailableNote}
              title={file.unavailableNote ?? (isRealFileUrl(file.url) ? undefined : "This record has no file behind it")}
              onClick={() => setPreview(file)}
            >
              <Paperclip className="h-3.5 w-3.5" /> View file
            </Button>
          </li>
        ))}
      </ul>
      <FilePreviewDialog
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
        url={preview?.url}
        title={preview?.name ?? "File"}
        description={preview?.meta}
      />
    </>
  );
}
