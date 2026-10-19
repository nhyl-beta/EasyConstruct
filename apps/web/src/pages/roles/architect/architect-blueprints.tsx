import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useState } from "react";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FileText, Plus, Search, Star } from "lucide-react";
import { useBlueprints } from "@/features/blueprint/hooks/useBlueprints";

function NewBlueprintDialog({
  creating,
  createError,
  onCreate,
}: {
  creating: boolean;
  createError: string | null;
  onCreate: (input: {
    drawingNumber: string;
    title: string;
    folder: string;
    author: string;
    projectCode?: string;
  }) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  useOpenOnAction("new-blueprint", () => setOpen(true));
  const [drawingNumber, setDrawingNumber] = useState("");
  const [title, setTitle] = useState("");
  const [folder, setFolder] = useState("");
  const [author, setAuthor] = useState("");
  const [projectCode, setProjectCode] = useState("");

  const reset = () => {
    setDrawingNumber("");
    setTitle("");
    setFolder("");
    setAuthor("");
    setProjectCode("");
  };

  const handleSubmit = async () => {
    if (!drawingNumber.trim() || !title.trim() || !folder.trim() || !author.trim()) return;
    const ok = await onCreate({
      drawingNumber: drawingNumber.trim(),
      title: title.trim(),
      folder: folder.trim(),
      author: author.trim(),
      projectCode: projectCode || undefined,
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
              <Input value={drawingNumber} onChange={(e) => setDrawingNumber(e.target.value)} placeholder="A-101" />
            </div>
            <div className="space-y-1.5">
              <Label>Folder</Label>
              <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Architectural" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ground Floor Plan" />
          </div>
          <div className="space-y-1.5">
            <Label>Project</Label>
            {/* E3: blueprints had no project association at all — every
                drawing sat in one flat, unfiltered gallery. */}
            <ProjectPicker value={projectCode} onChange={setProjectCode} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <Label>Author</Label>
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" />
          </div>
          {createError && <p className="text-sm text-destructive-strong">{createError}</p>}
        </div>
        <DialogFooter>
          <Button
            disabled={creating || !drawingNumber.trim() || !title.trim() || !folder.trim() || !author.trim()}
            onClick={handleSubmit}
          >
            {creating ? "Saving…" : "Register blueprint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ArchitectBlueprints() {
  const c = useBlueprints();
  const pg = usePagination(c.blueprints, 12, `${c.query}|${c.folder}`);
  const currentRevisions = useCurrentRevisions("blueprint");

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Blueprint library"
        description="Every drawing across projects, grouped by folder."
        actions={<NewBlueprintDialog creating={c.creating} createError={c.createError} onCreate={c.create} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={c.query} onChange={(e) => c.setQuery(e.target.value)} placeholder="Search blueprints…" className="h-8 pl-8 text-xs" />
        </div>
        <Select value={c.folder} onValueChange={c.setFolder}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All folders</SelectItem>
            {c.folders.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="w-56">
          <ProjectPicker value={c.projectCode} onChange={c.setProjectCode} placeholder="All projects" className="h-8 text-xs" />
        </div>
      </div>

      {c.loading ? (
        <div className="text-sm text-muted-foreground">Loading blueprints…</div>
      ) : c.blueprints.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No blueprints match this view.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pg.pageItems.map((b) => (
            <div key={b.id} className="rounded-2xl border p-4">
              <div className="flex aspect-[4/3] items-center justify-center rounded-xl border-2 border-dashed bg-muted/40 text-xs text-muted-foreground">
                <FileText className="mr-1 h-3.5 w-3.5" /> {b.fileType}
              </div>
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
