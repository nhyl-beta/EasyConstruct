// client/src/components/shared/file-preview-dialog.tsx
//
// "View Document" used to be a bare <a target="_blank"> around a stored file
// URL. Handing the file straight to the browser means the app can say nothing
// at all about it: a moved or missing upload produced a raw 404 in a new tab,
// and an office document silently turned into a download. Neither is "showing
// the document" to a reviewer who is trying to confirm what was submitted.
//
// This renders the file in place instead — inline for the formats a browser
// can actually display, with an explicit, readable state for everything else
// and for files that are no longer on the server. Opening in a new tab and
// downloading stay available, they are just no longer the only outcome.
import { useState } from "react";
import { Download, ExternalLink, FileWarning, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { downloadFileUrl, isRealFileUrl, useFileObjectUrl } from "@/lib/file-url";
import { FileIntegrityBadge } from "@/features/uploads/components/FileIntegrityBadge";
import { useFileIntegrity } from "@/features/uploads/hooks/use-file-integrity";

type PreviewKind = "image" | "pdf" | "other";

/** What the browser can render inline, keyed off the stored file extension. */
function previewKind(url: string): PreviewKind {
  const path = url.split(/[?#]/)[0]?.toLowerCase() ?? "";
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(path)) return "image";
  if (/\.pdf$/.test(path)) return "pdf";
  return "other";
}

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Stored URL — absolute (Vercel Blob) or API-relative ("/uploads/..."). */
  url: string | null | undefined;
  title: string;
  /** Optional line under the title: project, version, uploader, date… */
  description?: string;
}

export function FilePreviewDialog({
  open,
  onOpenChange,
  url,
  title,
  description,
}: FilePreviewDialogProps) {
  const hasFile = isRealFileUrl(url);
  const kind = hasFile ? previewKind(url as string) : "other";

  // The file is fetched WITH the caller's token (stored files are private —
  // see lib/file-url.ts) and shown from an object URL. "available" is derived
  // from that fetch: rows survive their files (an upload written to a
  // container's local disk is gone on the next deploy), and a reviewer needs
  // to be told that rather than shown an empty frame.
  const { objectUrl: resolved, error, loading } = useFileObjectUrl(url, open && hasFile);
  const available: boolean | null = !hasFile || loading ? null : error ? false : resolved ? true : null;
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const integrity = useFileIntegrity(hasFile ? url : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="whitespace-normal break-words">
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="whitespace-normal break-words">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {hasFile && (
          <div className="flex flex-wrap items-center gap-2">
            <FileIntegrityBadge url={url} withCheck />
            {integrity === "damaged" && (
              <p role="alert" className="text-xs text-destructive-strong">
                This file no longer matches the version that was uploaded. Treat its contents with care.
              </p>
            )}
          </div>
        )}

        <div className="flex min-h-72 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
          {!hasFile && (
            <PreviewNotice
              title="No file was attached"
              body="This record was created without an uploaded file, so there is nothing to display."
            />
          )}

          {hasFile && available === null && (
            <p className="flex items-center gap-2 px-6 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading document…
            </p>
          )}

          {hasFile && available === false && (
            <PreviewNotice
              title="This file is no longer on the server"
              body="The record still references it, but the stored file cannot be found. Ask the uploader to attach it again."
            />
          )}

          {resolved && available === true && kind === "image" && (
            <img
              src={resolved}
              alt={title}
              className="max-h-[70vh] w-full object-contain"
            />
          )}

          {resolved && available === true && kind === "pdf" && (
            <iframe
              src={resolved}
              title={title}
              className="h-[70vh] w-full border-0 bg-card"
            />
          )}

          {resolved && available === true && kind === "other" && (
            <PreviewNotice
              title="This format cannot be shown in the browser"
              body="Word, Excel and CAD files have no in-browser viewer. Download it to open in the matching application."
            />
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {hasFile && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                <Button variant="outline" asChild disabled={!resolved}>
                  <a href={resolved ?? undefined} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open in new tab
                  </a>
                </Button>
                <Button
                  disabled={!resolved}
                  onClick={() => {
                    setDownloadError(null);
                    downloadFileUrl(url).catch((err: Error) =>
                      setDownloadError(err.message),
                    );
                  }}
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
              {downloadError && (
                <p className="text-xs text-destructive-strong">{downloadError}</p>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewNotice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex max-w-sm flex-col items-center gap-2 px-6 py-12 text-center">
      <FileWarning className="h-5 w-5 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

FilePreviewDialog.displayName = "FilePreviewDialog";
