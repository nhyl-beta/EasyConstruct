// client/src/pages/roles/consultant/proposal-attachments.tsx
//
// The files behind a proposal, on the consultant's review screen.
//
// A proposal row has no file column of its own — the architect submits title,
// amount and a description — so "the submission's attached files" are the
// documents filed against the proposal's project in the documents repository.
// Those are fetched here and shown with a real preview rather than a bare
// link, which is the same treatment every other document surface in the app
// gives them.
//
// If the proposal was raised through the Design Proposal Approval workflow,
// the design document also lives on that workflow as an attachment; the
// consultant sees that one from /approvals via WorkflowDetailDialog.
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
  }, [proposal.projectCode]);

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
          files={submitted.files.map((f) => ({
            key: f.id,
            name: f.name,
            url: f.url,
            meta: [fileTypeLabel(f.name), f.size, f.uploadedBy, f.filedAt ? formatRelativeTime(f.filedAt) : null]
              .filter(Boolean)
              .join(" · "),
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
          <p role="alert" className="text-sm text-destructive-strong">
            {error}
          </p>
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
