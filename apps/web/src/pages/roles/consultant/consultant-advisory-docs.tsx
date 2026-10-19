import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useMemo, useRef, useState } from "react";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Search,
  Upload,
  X,
} from "lucide-react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import { FilePreviewDialog } from "@/components/shared/file-preview-dialog";
import { ProjectPicker } from "@/components/shared/project-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useStaffedProjectCodes } from "@/features/project-members/hooks/use-staffed-project-codes";
import { useRelatedCandidates } from "@/features/documents/hooks/use-related-candidates";
import { isRealFileUrl } from "@/lib/file-url";
import { useFieldDocuments } from "@/features/documents/hooks/use-field-documents";
import type { DocumentRecord } from "@/features/documents/repositories/documents.repository";

type UploadForm = {
  title: string;
  project: string;
  type: string;
  /** "proposal:12" / "design:3", or "" for none. */
  related: string;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ACCEPTED_FILE_TYPES = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
];

function getDocumentType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "pdf":
      return "PDF";
    case "doc":
    case "docx":
      return "Word Document";
    case "xls":
    case "xlsx":
      return "Spreadsheet";
    case "ppt":
    case "pptx":
      return "Presentation";
    case "png":
    case "jpg":
    case "jpeg":
      return "Image";
    default:
      return "Document";
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Unknown date";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleDateString();
}

export default function AdvisoryDocsPage() {
  const {
    documents,
    loading,
    error,
    uploading,
    upload,
    refresh,
  } = useFieldDocuments();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { codes: staffedCodes } = useStaffedProjectCodes("consultant");

  const [showUploadForm, setShowUploadForm] = useState(false);
  useOpenOnAction("upload-advisory", () => setShowUploadForm(true), { acceptNew: true });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [form, setForm] = useState<UploadForm>({
    title: "",
    project: "",
    type: "",
    related: "",
  });
  const { candidates: relatedCandidates, loading: relatedLoading } = useRelatedCandidates(form.project);
  const relatedLabel = (type?: string | null, id?: number | null) => {
    if (!type || !id) return null;
    return `${type === "design" ? "Design" : "Proposal"} #${id}`;
  };

  const [search, setSearch] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // The advisory document currently open in the preview dialog. "View
  // Document" used to be an <a target="_blank"> that only rendered when the
  // row had a usable fileUrl, so a document with a missing or legacy path
  // offered no affordance at all and the ones that did render handed the
  // reviewer a browser 404. Every row now opens the same viewer, which shows
  // the file inline and says plainly when it cannot.
  const [previewing, setPreviewing] = useState<DocumentRecord | null>(null);

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return documents;
    }

    return documents.filter((document) => {
      return (
        document.title.toLowerCase().includes(query) ||
        document.project.toLowerCase().includes(query) ||
        document.type.toLowerCase().includes(query) ||
        document.documentId.toLowerCase().includes(query)
      );
    });
  }, [documents, search]);
  const pg = usePagination(filteredDocuments, 10, search);

  const resetUploadForm = () => {
    setForm({
      title: "",
      project: "",
      type: "",
      related: "",
    });

    setSelectedFile(null);
    setFormError(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const closeUploadForm = () => {
    if (uploading) {
      return;
    }

    setShowUploadForm(false);
    resetUploadForm();
  };

  const handleFileChange = (file: File | null) => {
    setFormError(null);
    setSuccessMessage(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setFormError(
        `The selected file is too large. Maximum file size is ${formatFileSize(
          MAX_FILE_SIZE,
        )}.`,
      );

      return;
    }

    setSelectedFile(file);

    setForm((current) => ({
      ...current,
      type: getDocumentType(file),
      title: current.title || file.name.replace(/\.[^/.]+$/, ""),
    }));
  };

const handleUpload = async () => {
  setFormError(null);
  setSuccessMessage(null);

  if (!selectedFile) {
    setFormError("Please select an advisory document.");
    return;
  }

  if (!form.title.trim()) {
    setFormError("Document title is required.");
    return;
  }

  if (!form.project.trim()) {
    setFormError("Select the project this advisory document is for.");
    return;
  }

  try {
    const [relatedType, relatedIdRaw] = form.related ? form.related.split(":") : [];
    await upload({
      file: selectedFile,
      title: form.title.trim(),
      project: form.project.trim(),
      type: form.type || getDocumentType(selectedFile),
      relatedType: relatedType === "proposal" || relatedType === "design" ? relatedType : undefined,
      relatedId: relatedIdRaw ? Number(relatedIdRaw) : undefined,
    });

    setSuccessMessage(
      `"${selectedFile.name}" was uploaded successfully.`,
    );

    setShowUploadForm(false);
    resetUploadForm();

    await refresh();
  } catch (uploadError) {
    setFormError(
      uploadError instanceof Error
        ? uploadError.message
        : "Failed to upload the advisory document.",
    );
  }
};

  return (
    <PageContainer>
      <PageHeader
        title="Advisory Documents"
        description="Upload and review advisory and reference documents for construction projects."
      />

      <PageContent className="min-h-96 space-y-6 p-6 md:p-8">
        {/* Header actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Consultant Advisory Library</h2>
            <p className="text-sm text-muted-foreground">
              Store documents that support consultant recommendations and project
              reviews.
            </p>
          </div>

          <Button
            type="button"
            onClick={() => {
              setSuccessMessage(null);
              setFormError(null);
              setShowUploadForm(true);
            }}
            disabled={uploading}
            className="gap-2"
          >
            <Upload className="size-4" />
            Upload Advisory
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive-strong" />

            <div className="flex-1">
              <p className="font-medium text-destructive-strong">
                Unable to load advisory documents
              </p>

              <p className="mt-1 text-muted-foreground">{error}</p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
            >
              Retry
            </Button>
          </div>
        )}

        {/* Success */}
        {successMessage && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border border-success/40 bg-success/10 p-4 text-sm"
          >
            <CheckCircle2 className="size-4 shrink-0 text-success-strong" />

            <span>{successMessage}</span>
          </div>
        )}

        {/* Upload form */}
        {showUploadForm && (
          <Card className="border-primary/30">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Upload Advisory Document</CardTitle>

                <p className="mt-1 text-sm text-muted-foreground">
                  Select a document from your computer and associate it with a
                  project.
                </p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeUploadForm}
                disabled={uploading}
                aria-label="Close upload form"
              >
                <X className="size-4" />
              </Button>
            </CardHeader>

            <CardContent className="space-y-5">
              {/* File */}
              <div className="space-y-2">
                <Label htmlFor="advisory-file">
                  Advisory Document <span className="text-destructive-strong">*</span>
                </Label>

                <div className="rounded-lg border border-dashed p-5">
                  <input
                    ref={fileInputRef}
                    id="advisory-file"
                    type="file"
                    accept={ACCEPTED_FILE_TYPES.join(",")}
                    className="hidden"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      handleFileChange(file);
                    }}
                  />

                  {!selectedFile ? (
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full flex-col items-center justify-center gap-2 rounded-md p-6 text-center transition-colors hover:bg-muted/50"
                    >
                      <div className="rounded-full bg-primary/10 p-3">
                        <Upload className="size-6 text-primary-strong" />
                      </div>

                      <span className="font-medium">
                        Choose an advisory document
                      </span>

                      <span className="text-sm text-muted-foreground">
                        PDF, Word, Excel, PowerPoint, PNG, JPG — up to 5 MB
                      </span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-3">
                        <FileText className="size-5 text-primary-strong" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {selectedFile.name}
                        </p>

                        <p className="text-sm text-muted-foreground">
                          {formatFileSize(selectedFile.size)}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploading}
                        onClick={() => {
                          setSelectedFile(null);

                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                      >
                        Change
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="advisory-title">
                  Document Title
                </Label>

                <Input
                  id="advisory-title"
                  placeholder="e.g. Structural Safety Recommendations"
                  value={form.title}
                  disabled={uploading}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </div>

              {/* Project */}
              <div className="space-y-2">
                <Label>Project</Label>

                <ProjectPicker
                  value={form.project}
                  onChange={(code) =>
                    setForm((current) => ({ ...current, project: code, related: "" }))
                  }
                  allowedCodes={staffedCodes}
                  disabled={uploading}
                  className="w-full"
                />

                <p className="text-xs text-muted-foreground">
                  {staffedCodes.length === 0
                    ? "You are not staffed on any project yet."
                    : "Only projects you are staffed on as a consultant are listed."}
                </p>
              </div>

              {/* Related item */}
              <div className="space-y-2">
                <Label>Related to (optional)</Label>

                <SearchableSelect
                  value={form.related || undefined}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, related: value === "none" ? "" : value }))
                  }
                  disabled={uploading || !form.project}
                  loading={relatedLoading}
                  className="w-full"
                  options={[
                    { value: "none", label: "Not tied to a specific item" },
                    ...relatedCandidates.map((c) => ({ value: `${c.type}:${c.id}`, label: c.label })),
                  ]}
                  placeholder={form.project ? "Select a proposal or design" : "Choose a project first"}
                  searchPlaceholder="Search proposals and designs…"
                  emptyText="No proposals or designs on this project"
                />

                <p className="text-xs text-muted-foreground">
                  Tie this advisory to the proposal or design it is about.
                </p>
              </div>

              {/* Type */}
              <div className="space-y-2">
                <Label htmlFor="advisory-type">
                  Document Type
                </Label>

                <Input
                  id="advisory-type"
                  placeholder="Document type"
                  value={form.type}
                  disabled={uploading}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      type: event.target.value,
                    }))
                  }
                />

                {selectedFile && (
                  <p className="text-xs text-muted-foreground">
                    Automatically detected from the selected file. You may
                    change it if necessary.
                  </p>
                )}
              </div>

              {/* Form error */}
              {formError && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive-strong" />

                  <span>{formError}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeUploadForm}
                  disabled={uploading}
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  onClick={() => void handleUpload()}
                  disabled={uploading || !selectedFile}
                  className="gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="size-4" />
                      Upload Document
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search advisory documents..."
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Advisory Documents</CardTitle>

                <p className="mt-1 text-sm text-muted-foreground">
                  {loading
                    ? "Loading documents..."
                    : `${filteredDocuments.length} document${
                        filteredDocuments.length === 1 ? "" : "s"
                      }`}
                </p>
              </div>

              <Badge variant="secondary">
                Consultant
              </Badge>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="flex min-h-40 items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading advisory documents...
                </div>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                <div className="rounded-full bg-muted p-3">
                  <FileText className="size-6 text-muted-foreground" />
                </div>

                <h3 className="mt-4 font-medium">
                  {search
                    ? "No matching documents"
                    : "No advisory documents yet"}
                </h3>

                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {search
                    ? "Try a different search term."
                    : "Upload an advisory document to begin building the consultant reference library."}
                </p>

                {!search && (
                  <Button
                    type="button"
                    className="mt-4 gap-2"
                    onClick={() => setShowUploadForm(true)}
                  >
                    <Upload className="size-4" />
                    Upload Advisory
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {pg.pageItems.map((document) => {
                  const hasFile = isRealFileUrl(document.fileUrl);
                  const related = relatedLabel(document.relatedType, document.relatedId);
                  return (
                  <div
                    key={document.id}
                    className={`flex flex-col gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center ${
                      hasFile ? "" : "bg-muted/20 opacity-70"
                    }`}
                  >
                    <div className="rounded-lg bg-primary/10 p-3">
                      <FileText className="size-5 text-primary-strong" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-medium">
                          {document.title}
                        </h3>

                        <Badge variant="outline">
                          {document.type || "Document"}
                        </Badge>

                        {!hasFile && (
                          <Badge variant="outline" className="border-warning/40 text-warning-strong">
                            No file attached
                          </Badge>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          Document ID: {document.documentId}
                        </span>

                        <span>
                          Project: {document.project}
                        </span>

                        <span>
                          Version: {document.version || "1.0"}
                        </span>

                        <span>
                          Uploaded: {formatDate(document.createdAt)}
                        </span>

                        {related && <span>Related to: {related}</span>}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      disabled={!hasFile}
                      onClick={() => setPreviewing(document)}
                    >
                      {hasFile ? "View Document" : "No file"}
                    </Button>
                  </div>
                  );
                })}
                <div className="pt-2">
                  <DataTablePagination {...pg} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>

      <FilePreviewDialog
        open={previewing !== null}
        onOpenChange={(open) => !open && setPreviewing(null)}
        url={previewing?.fileUrl}
        title={previewing?.title ?? ""}
        description={
          previewing
            ? `${previewing.documentId} · ${previewing.project} · version ${
                previewing.version || "1.0"
              }`
            : undefined
        }
      />
    </PageContainer>
  );
}

AdvisoryDocsPage.displayName = "AdvisoryDocsPage";