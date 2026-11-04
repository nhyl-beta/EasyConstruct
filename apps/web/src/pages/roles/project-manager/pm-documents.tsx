// src/pages/project-manager/pm-documents.tsx
import { useState } from "react";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";
import {
  FileText,
  Upload,
  Folder,
  FolderOpen,
  Search,
  Eye,
  Pencil,
  Trash2,
  FileSignature,
  Image as ImageIcon,
  FileSpreadsheet,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge }   from "@/components/ui/badge";
import { Button }  from "@/components/ui/button";
import { Input }   from "@/components/ui/input";
import { useAuth } from "@/auth/auth-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EditDocumentDialog } from "@/components/documents/edit-document-dialog";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import { FilePreviewDialog } from "@/components/shared/file-preview-dialog";
import { useDocumentsPaged } from "@/features/documents/hooks/useDocumentsPaged";
import type { DocumentRecord } from "@/features/documents/repositories/documents.repository";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { FileIntegrityBadge } from "@/features/uploads/components/FileIntegrityBadge";

// Icon resolver — mapped from real `type` values (the schema's enum), not
// a separate iconKey field that doesn't exist on this table.
const TYPE_ICONS: Record<string, LucideIcon> = {
  "Field Report": FileText,
  "Site Photo": ImageIcon,
  "Progress Evidence": FileSpreadsheet,
  "Supporting Document": FileSignature,
};


export default function DocumentsPage() {
  const [uploadOpen, setUploadOpen] = useState(false);
  useOpenOnAction("upload-document", () => setUploadOpen(true));
  // Same viewer Consultant's advisory register uses — both read the same
  // `documents` table, so both hit the same missing-file and legacy-path
  // rows, and both now report that instead of opening a blank tab.
  const [previewing, setPreviewing] = useState<DocumentRecord | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);
  const { list, typeCounts, uploading, upload, edit, remove, changing } = useDocumentsPaged(activeType);
  // Only Admin may change a document (edit or delete); everyone else here can upload and view.
  const { user } = useAuth();
  const canChange = user?.role === "admin";
  const [editing, setEditing] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState<DocumentRecord | null>(null);
  const { loading, searchInput: search, setSearchInput: setSearch } = list;
  const documents = list.pageItems;

  const categories = typeCounts;
  const onFile = typeCounts.reduce((n, c) => n + c.count, 0);
  const filtered = documents;
  const pagination = list;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Document repository</h2>
          <p className="text-sm text-muted-foreground">
            {onFile} document{onFile === 1 ? "" : "s"} on file
          </p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4" /> Upload
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {categories.map((c) => (
          <Card
            key={c.type}
            role="button"
            tabIndex={0}
            aria-pressed={activeType === c.type}
            onClick={() => setActiveType(activeType === c.type ? null : c.type)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActiveType(activeType === c.type ? null : c.type);
              }
            }}
            className={`cursor-pointer rounded-2xl border-border shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeType === c.type ? "border-primary bg-accent/30" : ""
            }`}
          >
            <CardContent className="space-y-1 p-4">
              {activeType === c.type ? <FolderOpen className="h-5 w-5 text-primary-strong" /> : <Folder className="h-5 w-5 text-primary-strong" />}
              <div className="text-sm font-medium">{c.type}</div>
              <div className="text-xs tabular-nums text-muted-foreground">{c.count} files</div>
            </CardContent>
          </Card>
        ))}
        {!loading && categories.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">No documents yet.</p>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">{activeType ?? "All documents"}</CardTitle>
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 border-border bg-muted/40 pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && <p className="p-5 text-sm text-muted-foreground">Loading documents…</p>}
          {!loading && filtered.length === 0 && (
            <p className="p-5 text-sm text-muted-foreground">No matching documents.</p>
          )}
          {!loading && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-border bg-muted/40 text-left text-overline uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-2.5">Document</th>
                    <th className="px-3 py-2.5">Project</th>
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Version</th>
                    <th className="px-3 py-2.5">Size</th>
                    <th className="px-3 py-2.5">Updated</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageItems.map((d) => {
                    const Icon = TYPE_ICONS[d.type] ?? FileText;
                    return (
                      <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/60 text-secondary-foreground">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="font-medium">{d.title}</div>
                              <div className="text-xs text-muted-foreground">{d.documentId} · by {d.uploadedBy}</div>
                              {d.fileUrl && <FileIntegrityBadge url={d.fileUrl} className="mt-1" />}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5 font-mono text-xs text-muted-foreground">{d.project}</td>
                        <td className="px-3 py-3.5">
                          <Badge variant="outline" className="rounded-full text-overline">{d.type}</Badge>
                        </td>
                        <td className="px-3 py-3.5"><span className="font-mono text-xs">{d.version}</span></td>
                        <td className="px-3 py-3.5 text-xs tabular-nums text-muted-foreground">{d.size ?? "—"}</td>
                        <td className="px-3 py-3.5 text-xs text-muted-foreground">
                          {formatRelativeTime(d.createdAt)}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end gap-1">
                            {canChange && (
                              <>
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit document" aria-label={`Edit ${d.title}`} onClick={() => setEditing(d)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive-strong" title="Delete document" aria-label={`Delete ${d.title}`} onClick={() => setDeleting(d)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="View document"
                              onClick={() => setPreviewing(d)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t border-border px-4 py-3">
                <DataTablePagination {...pagination} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} uploading={uploading} onSubmit={upload} />

      <EditDocumentDialog
        document={editing}
        saving={changing}
        onClose={() => setEditing(null)}
        onSave={async (id, patch) => {
          await edit(id, patch);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this document?"
        description={deleting ? `"${deleting.title}" (${deleting.documentId}) and its file will be permanently removed. The deletion is recorded in the audit trail.` : undefined}
        confirmLabel="Delete"
        loading={changing}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove(deleting.id);
            setDeleting(null);
          } catch {
            // the toast already explains; keep the dialog open
          }
        }}
      />

      <FilePreviewDialog
        open={previewing !== null}
        onOpenChange={(open) => !open && setPreviewing(null)}
        url={previewing?.fileUrl}
        title={previewing?.title ?? ""}
        description={
          previewing
            ? `${previewing.documentId} · ${previewing.project} · ${previewing.type}`
            : undefined
        }
      />
    </div>
  );
}