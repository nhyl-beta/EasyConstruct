import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useEffect, useState } from "react";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ProjectPicker } from "@/components/shared/project-picker";
import { RevisionLink } from "@/features/revisions/components/RevisionLink";
import { useCurrentRevisions } from "@/features/revisions/hooks/useCurrentRevisions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { validateBlueprintForm, type BlueprintFormValues } from "@/features/blueprint/lib/blueprint-form";
import { Download, FileText, Folder, Paperclip, Plus, Search, Star, User } from "lucide-react";
import { checkUploadable, formatBytes, getMaxUploadBytes, uploadLargeFile } from "@/features/uploads/lib/upload-file";
import { downloadFileUrl } from "@/lib/file-url";
import { pdfThumbnail } from "@/features/blueprint/lib/pdf-thumbnail";
import type { Blueprint, CreateBlueprintInput } from "@/features/blueprint/types/blueprint.types";
import { architectFolders, filesIn, projectFolders, type DirectoryEntry } from "@/features/blueprint/lib/blueprint-directory";
import { useBlueprints } from "@/features/blueprint/hooks/useBlueprints";

function NewBlueprintDialog({
  creating,
  createError,
  onCreate,
}: {
  creating: boolean;
  createError: string | null;
  onCreate: (input: CreateBlueprintInput) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  useOpenOnAction("new-blueprint", () => setOpen(true));
  const [drawingNumber, setDrawingNumber] = useState("");
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState("");
  const [projectCode, setProjectCode] = useState("");
  // Optional drawing file (DWG, PDF, ...), sent with the shared large-file upload before the row is saved.
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [maxLabel, setMaxLabel] = useState<string | null>(null);
  useEffect(() => {
    getMaxUploadBytes().then((b) => setMaxLabel(formatBytes(b))).catch(() => setMaxLabel(null));
  }, []);

  // A field shows its message once it has been left (or a submit was tried); the button stays
  // disabled until every field is valid.
  const [touched, setTouched] = useState<Partial<Record<keyof BlueprintFormValues, boolean>>>({});
  const errors = validateBlueprintForm({ drawingNumber, folder, title });
  const valid = Object.keys(errors).length === 0;
  const touch = (key: keyof BlueprintFormValues) => setTouched((t) => ({ ...t, [key]: true }));
  const fieldError = (key: keyof BlueprintFormValues) => (touched[key] ? errors[key] : undefined);
  const fieldProps = (key: keyof BlueprintFormValues) => ({
    onBlur: () => touch(key),
    "aria-invalid": fieldError(key) ? true : undefined,
    "aria-describedby": fieldError(key) ? `bp-${key}-error` : undefined,
    className: fieldError(key) ? "border-destructive focus-visible:ring-destructive" : undefined,
  });
  const FieldError = ({ name }: { name: keyof BlueprintFormValues }) =>
    fieldError(name) ? (
      <p id={`bp-${name}-error`} role="alert" className="text-xs text-destructive-strong">
        {fieldError(name)}
      </p>
    ) : null;

  const reset = () => {
    setTouched({});
    setDrawingNumber("");
    setTitle("");
    setFolder("");
    setProjectCode("");
    setFile(null);
    setFileError(null);
  };

  const handleSubmit = async () => {
    if (!valid) {
      setTouched({ drawingNumber: true, folder: true, title: true });
      return;
    }
    let stored: Awaited<ReturnType<typeof uploadLargeFile>> | null = null;
    if (file) {
      setUploadPct(0);
      try {
        stored = await uploadLargeFile(file, setUploadPct);
      } catch (err) {
        setFileError(err instanceof Error ? err.message : "The upload failed.");
        return;
      } finally {
        setUploadPct(null);
      }
    }
    const thumbnail = file?.name.toLowerCase().endsWith(".pdf") ? await pdfThumbnail(file) : null;
    const ok = await onCreate({
      drawingNumber: drawingNumber.trim(),
      title: title.trim(),
      folder: folder.trim(),
      projectCode: projectCode || undefined,
      ...(thumbnail ? { thumbnail } : {}),
      ...(file && stored
        ? { fileUrl: stored.url, fileType: file.name.split(".").pop()!.toUpperCase().slice(0, 20), sizeKb: Math.max(1, Math.round(stored.sizeBytes / 1024)) }
        : {}),
    });
    if (ok) {
      reset();
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New blueprint
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register a blueprint</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Drawing number</Label>
              <Input value={drawingNumber} onChange={(e) => setDrawingNumber(e.target.value)} placeholder="A-101" {...fieldProps("drawingNumber")} />
              <FieldError name="drawingNumber" />
            </div>
            <div className="space-y-1.5">
              <Label>Folder</Label>
              <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Architectural" {...fieldProps("folder")} />
              <FieldError name="folder" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ground Floor Plan" {...fieldProps("title")} />
            <FieldError name="title" />
          </div>
          <div className="space-y-1.5">
            <Label>Project</Label>
            {/* E3: blueprints had no project association at all — every
                drawing sat in one flat, unfiltered gallery. */}
            <ProjectPicker value={projectCode} onChange={setProjectCode} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <Label>Drawing file <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{file ? `${file.name} · ${formatBytes(file.size)}` : "Choose a DWG, DXF or PDF file"}</span>
              <input
                type="file"
                accept=".dwg,.dxf,.pdf,.rvt,.ifc,.skp,.png,.jpg,.jpeg,.tif,.tiff"
                className="hidden"
                disabled={uploadPct !== null}
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  setFile(picked);
                  setFileError(null);
                  if (picked) void checkUploadable(picked).then(setFileError);
                  e.target.value = "";
                }}
              />
            </label>
            {maxLabel && <p className="text-xs text-muted-foreground">Files up to {maxLabel}.</p>}
            {fileError && <p role="alert" className="text-xs text-destructive-strong">{fileError}</p>}
          </div>
          {createError && <p className="text-sm text-destructive-strong">{createError}</p>}
        </div>
        <DialogFooter>
          <Button
            disabled={creating || uploadPct !== null || !valid || !!fileError}
            onClick={handleSubmit}
          >
            {uploadPct !== null ? `Uploading ${uploadPct}%…` : creating ? "Saving…" : "Register blueprint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// A PDF shows the page-1 image made at upload; DWG and other types (or older rows) keep the file-type placeholder.
function DrawingPreview({ b }: { b: Blueprint }) {
  return (
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border bg-muted/40 text-xs text-muted-foreground">
      {b.thumbnail ? (
        <img src={b.thumbnail} alt={`Preview of ${b.drawingNumber}`} className="h-full w-full bg-white object-contain" />
      ) : (
        <><FileText className="mr-1 h-3.5 w-3.5" /> {b.fileType}</>
      )}
    </div>
  );
}

function DirectoryTile({ entry, icon: Icon, onOpen }: { entry: DirectoryEntry; icon: typeof Folder; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors hover:bg-muted/40">
      <Icon className="h-8 w-8 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{entry.name}</div>
        <div className="text-overline text-muted-foreground">{entry.count} {entry.count === 1 ? "drawing" : "drawings"}</div>
      </div>
    </button>
  );
}

export default function ArchitectBlueprints() {
  const c = useBlueprints();
  const currentRevisions = useCurrentRevisions("blueprint");
  // Library path: all projects -> one project -> one architect's drawings. A search shows matches from everywhere.
  const [project, setProject] = useState<string | null>(null);
  const [architect, setArchitect] = useState<string | null>(null);
  const searching = c.query.trim() !== "";
  const showProjects = !searching && project === null;
  const showArchitects = !searching && project !== null && architect === null;
  const files = filesIn(c.blueprints, searching ? null : project, searching ? null : architect);
  const pg = usePagination(files, 12, `${c.query}|${project}|${architect}`);

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Blueprint library"
        description="One folder per project, and inside it one folder per architect."
        actions={<NewBlueprintDialog creating={c.creating} createError={c.createError} onCreate={c.create} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={c.query} onChange={(e) => c.setQuery(e.target.value)} placeholder="Search blueprints…" className="h-8 pl-8 text-xs" />
        </div>
        {!searching && (
          <nav aria-label="Library path" className="flex items-center gap-1 text-sm">
            <button type="button" className="hover:underline" onClick={() => { setProject(null); setArchitect(null); }}>All projects</button>
            {project !== null && (<>
              <span className="text-muted-foreground">/</span>
              <button type="button" className="hover:underline" onClick={() => setArchitect(null)}>{project}</button>
            </>)}
            {architect !== null && (<>
              <span className="text-muted-foreground">/</span>
              <span className="font-medium">{architect}</span>
            </>)}
          </nav>
        )}
      </div>

      {c.loading ? (
        <div className="text-sm text-muted-foreground">Loading blueprints…</div>
      ) : c.blueprints.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No blueprints match this view.
        </div>
      ) : showProjects ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {projectFolders(c.blueprints).map((e) => <DirectoryTile key={e.name} entry={e} icon={Folder} onOpen={() => setProject(e.name)} />)}
        </div>
      ) : showArchitects ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {architectFolders(c.blueprints, project!).map((e) => <DirectoryTile key={e.name} entry={e} icon={User} onOpen={() => setArchitect(e.name)} />)}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pg.pageItems.map((b) => (
            <div key={b.id} className="rounded-2xl border p-4">
              <DrawingPreview b={b} />
              <div className="mt-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{b.drawingNumber} · {b.title}</div>
                  <div className="text-overline text-muted-foreground">
                    {b.folder}{b.projectCode ? ` · ${b.projectCode}` : ""}
                  </div>
                </div>
                {b.favorite && <Star className="h-4 w-4 shrink-0 fill-warning text-warning-foreground" />}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <StatusBadge status={b.status} />
              </div>
              <div className="mt-2 flex items-center justify-between text-overline text-muted-foreground">
                <span>{b.author}</span>
                <span>Rev {b.revision}</span>
              </div>
              {b.fileUrl && (
                <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void downloadFileUrl(b.fileUrl, `${b.drawingNumber}.${b.fileType.toLowerCase()}`)}>
                  <Download className="h-3.5 w-3.5" /> Download {b.fileType}
                </Button>
              )}
              <div className="mt-2 border-t pt-2">
                <RevisionLink itemType="blueprint" itemId={b.id} current={currentRevisions[b.id]} />
              </div>
            </div>
          ))}
          <div className="col-span-full">
            <DataTablePagination {...pg} />
          </div>
        </div>
      )}
    </div>
  );
}

ArchitectBlueprints.displayName = "ArchitectBlueprints";
