import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useState } from "react";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { FileText, Search, Upload } from "lucide-react";
import { useArchitectDocuments } from "@/features/architect-documents/hooks/useArchitectDocuments";
import { UploadDocumentDialog } from "@/components/documents/upload-document-dialog";
import { useFieldDocuments } from "@/features/documents/hooks/use-field-documents";
import { RevisionLink } from "@/features/revisions/components/RevisionLink";
import { useCurrentRevisions } from "@/features/revisions/hooks/useCurrentRevisions";

export default function ArchitectDocumentation() {
  const c = useArchitectDocuments();
  const pg = usePagination(c.docs, 12, `${c.query}|${c.category}`);
  const currentRevisions = useCurrentRevisions("plan");
  // H7: separate from useArchitectDocuments' own read-only table above — an
  // As-Built Drawing (gate X-check territory) has to land in the shared
  // `documents` table every other role's uploads and the lifecycle gates
  // read from, not this page's own architect-documents table.
  const { uploading, upload } = useFieldDocuments();
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Documentation"
        description="Specifications, permits, and supporting documents."
        actions={
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4" /> Upload As-Built / document
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={c.query} onChange={(e) => c.setQuery(e.target.value)} placeholder="Search documents…" className="h-8 pl-8 text-xs" />
        </div>
        <Select value={c.category} onValueChange={c.setCategory}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {c.categories.map((cat) => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {c.loading ? (
        <div className="text-sm text-muted-foreground">Loading documents…</div>
      ) : c.docs.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No documents yet.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pg.pageItems.map((d) => (
            <div key={d.id} className="rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary-strong">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">{d.title}</div>
                    <div className="text-overline text-muted-foreground">{d.category} · {d.version}</div>
                  </div>
                </div>
                <StatusBadge status={d.status} />
              </div>
              <div className="mt-3 flex items-center justify-between text-overline text-muted-foreground">
                <span>{d.owner}</span>
                <span>{d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : "—"}</span>
              </div>
              <div className="mt-2 border-t pt-2">
                <RevisionLink itemType="plan" itemId={d.id} current={currentRevisions[d.id]} />
              </div>
            </div>
          ))}
          <div className="col-span-full">
            <DataTablePagination {...pg} />
          </div>
        </div>
      )}

      <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} uploading={uploading} onSubmit={upload} />
    </div>
  );
}

ArchitectDocumentation.displayName = "ArchitectDocumentation";