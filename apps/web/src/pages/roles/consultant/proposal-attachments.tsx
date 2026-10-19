// apps/web/src/pages/roles/consultant/proposal-attachments.tsx
//
// The files behind a proposal, on the consultant's review screen.
//
// "Submitted with this proposal" are the files the Architect attached to the proposal's
// approval workflow (GET /proposals/:id/files). "Other project documents" are documents filed
// against the project. Both show a real error with a Retry button when loading fails, and
// "no files" only when the server answered with an empty list.
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useEffect, useState } from "react";
import { FileText, Paperclip } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilePreviewDialog } from "@/components/shared/file-preview-dialog";
import {
  documentsRepository,
  type DocumentRecord,
} from "@/features/documents/repositories/documents.repository";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { SubmittedFiles } from "@/components/shared/submitted-files";
import { fileTypeLabel } from "@/lib/file-type-label";
import { useProposalFiles } from "@/features/proposals/hooks/useProposalFiles";
import type { Proposal } from "@/features/proposals/types/proposal.types";

export function ProposalAttachments({ proposal }: { proposal: Proposal }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<DocumentRecord | null>(null);
  const submitted = useProposalFiles(proposal.id);
  const pg = usePagination(documents, 8);

  useEffect(() => {
    if (!proposal.projectCode) {
      setDocuments([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    documentsRepository
      .listByProject(proposal.projectCode)
      .then((result) => {
        if (cancelled) return;
        setDocuments(Array.isArray(result?.data) ? result.data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Couldn't load the project's files.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [proposal.projectCode, attempt]);

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b p-6">
        <h2 className="font-semibold">Attached Files</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          What the Architect submitted with this proposal, then other documents
          filed against {proposal.projectCode}.
        </p>
      </div>

      <div className="space-y-2 border-b p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Submitted with this proposal
        </p>
        <SubmittedFiles
          loading={submitted.loading}
          error={submitted.error}
          emptyText="No files were submitted with this proposal."
          onRetry={submitted.reload}
          files={submitted.files.map((f) => ({
            key: f.id,
            name: f.name,
            url: f.url,
            meta: [fileTypeLabel(f.name), f.size, f.uploadedBy, f.filedAt ? formatRelativeTime(f.filedAt) : null]
              .filter(Boolean)
              .join(" · "),
            unavailableNote:
              f.available === false
                ? "This file is no longer stored (it was uploaded before storage was fixed). Ask the Architect to attach it again."
                : undefined,
          }))}
        />
      </div>

      <div className="p-6">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Other project documents
        </p>
        {loading && (
          <p className="text-sm text-muted-foreground">Loading files…</p>
        )}

        {!loading && error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive-strong">
            <span>{error}</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && documents.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No files have been filed against this project yet.
          </p>
        )}

        {!loading && !error && documents.length > 0 && (
          <ul className="space-y-2">
            {pg.pageItems.map((document) => (
              <li
                key={document.id}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary/60 text-secondary-foreground">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{document.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {document.type} · {document.version}
                    {document.size && ` · ${document.size}`}
                    {document.uploadedBy && ` · ${document.uploadedBy}`}
                    {document.createdAt &&
                      ` · ${formatRelativeTime(document.createdAt)}`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-xs"
                  disabled={!document.fileUrl}
                  title={
                    document.fileUrl
                      ? undefined
                      : "This record has no file behind it"
                  }
                  onClick={() => setPreview(document)}
                >
                  <Paperclip className="h-3.5 w-3.5" /> View file
                </Button>
              </li>
            ))}
            <li className="list-none pt-2">
              <DataTablePagination {...pg} />
            </li>
          </ul>
        )}
      </div>

      <FilePreviewDialog
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
        url={preview?.fileUrl}
        title={preview?.title ?? "Document"}
        description={
          preview
            ? [preview.project, preview.type, preview.version]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
      />
    </div>
  );
}

ProposalAttachments.displayName = "ProposalAttachments";
