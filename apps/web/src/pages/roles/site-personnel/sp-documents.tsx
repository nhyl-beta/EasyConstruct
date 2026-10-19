import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useRef, useState } from "react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";

import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Upload, FileText } from "lucide-react";

import { DocumentTypeSelect } from "@/features/document-types/components/DocumentTypeSelect";
import { useFieldDocuments } from "@/features/documents/hooks/use-field-documents";

// Site Personnel file field documents only; the list comes from the API (category "Field").
const FIELD_CATEGORIES = ["Field"];

export default function SPDocumentsPage() {
  const {
    documents,
    loading,
    error,
    uploading,
    upload,
  } = useFieldDocuments();
  const pg = usePagination(documents, 10);

  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");

  const [type, setType] = useState("Field Report");

  const [file, setFile] = useState<File | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!title.trim() || !project.trim() || !file) {
      return;
    }

    await upload({
      file,
      title: title.trim(),
      project: project.trim(),
      type,
    });

    setTitle("");
    setProject("");
    setType("Field Report");
    setFile(null);

    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Field Documentation"
        description="Upload site photos, field reports, and progress evidence"
      />

      <PageContent className="space-y-6 p-6 md:p-8">
        <SectionCard title="Upload document">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sp-project">
                Project code
              </Label>

              <Input
                id="sp-project"
                value={project}
                onChange={(event) =>
                  setProject(event.target.value)
                }
                placeholder="e.g. PRJ-2024-01"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sp-title">
                Title
              </Label>

              <Input
                id="sp-title"
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                placeholder="Foundation pour — Zone B"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sp-type">
                Document type
              </Label>

              <DocumentTypeSelect id="sp-type" value={type} onChange={setType} categories={FIELD_CATEGORIES} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sp-file">
                File
              </Label>

              <Input
                id="sp-file"
                ref={fileRef}
                type="file"
                onChange={(event) =>
                  setFile(
                    event.target.files?.[0] ?? null,
                  )
                }
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 text-sm text-destructive-strong">
              {error}
            </p>
          )}

          <Button
            className="mt-4"
            disabled={
              uploading ||
              !title.trim() ||
              !project.trim() ||
              !file
            }
            onClick={handleUpload}
          >
            <Upload className="mr-2 h-4 w-4" />

            {uploading
              ? "Uploading…"
              : "Upload document"}
          </Button>
        </SectionCard>

        <SectionCard title="Recent uploads">
          {loading ? (
            <p className="text-sm text-muted-foreground">
              Loading documents…
            </p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents uploaded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {pg.pageItems.map((document) => (
                <div
                  key={document.id}
                  className="flex items-center justify-between rounded-xl border p-3"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />

                    <div>
                      <div className="text-sm font-medium">
                        {document.title}
                      </div>

                      <div className="text-xs text-muted-foreground">
                        {document.project} ·{" "}
                        {document.type} ·{" "}
                        {document.version}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="pt-2">
                <DataTablePagination {...pg} />
              </div>
            </div>
          )}
        </SectionCard>
      </PageContent>
    </PageContainer>
  );
}

SPDocumentsPage.displayName = "SPDocumentsPage";
