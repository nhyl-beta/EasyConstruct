import { useEffect, useRef, useState } from "react";
import { Paperclip, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ProjectPicker } from "@/components/shared/project-picker";
import { useAuth } from "@/auth/auth-context";
import { useStaffedProjectCodes } from "@/features/project-members/hooks/use-staffed-project-codes";
import { formatBytes, getMaxUploadBytes } from "@/features/uploads/lib/upload-file";
import { useCreateRevision } from "../hooks/useCreateRevision";
import { useRevisionItemOptions } from "../hooks/useRevisionItemOptions";
import { RevisionRepository } from "../repositories/revision.repository";
import { ITEM_TYPE_LABEL, REVISION_ITEM_TYPES, type Revision, type RevisionItemType } from "../types/revision.types";

const NEW_PLAN = "__new__";
const ACCEPT = ".pdf,.dwg,.dxf,.rvt,.ifc,.skp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-select an item (e.g. from a "New version" action on the history drawer). */
  initial?: { projectCode: string; itemType: RevisionItemType; itemId: number } | null;
  onCreated: (revision: Revision) => void;
}

export function CreateRevisionDialog({ open, onOpenChange, initial, onCreated }: Props) {
  const { user } = useAuth();
  const { codes: staffedCodes } = useStaffedProjectCodes("architect");
  const c = useCreateRevision();

  const [project, setProject] = useState("");
  const [itemType, setItemType] = useState<RevisionItemType>("design");
  const [itemId, setItemId] = useState<string>("");
  const [newTitle, setNewTitle] = useState("");
  const [label, setLabel] = useState("");
  const [summary, setSummary] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [nextVersion, setNextVersion] = useState<number | null>(null);
  const [maxLabel, setMaxLabel] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const { options, loading: optionsLoading } = useRevisionItemOptions(project, itemType);
  const starting = itemType === "plan" && itemId === NEW_PLAN;

  useEffect(() => {
    getMaxUploadBytes().then((b) => setMaxLabel(formatBytes(b))).catch(() => setMaxLabel(null));
  }, []);

  // Fresh form every time it opens, or pre-filled from "initial".
  useEffect(() => {
    if (!open) return;
    setProject(initial?.projectCode ?? "");
    setItemType(initial?.itemType ?? "design");
    setItemId(initial ? String(initial.itemId) : "");
    setNewTitle("");
    setLabel("");
    setSummary("");
    setFile(null);
    setFileError(null);
    setTried(false);
    c.clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.projectCode, initial?.itemType, initial?.itemId]);

  // Show the version number this upload will get.
  useEffect(() => {
    if (!itemId || starting) {
      setNextVersion(starting ? 1 : null);
      return;
    }
    let cancelled = false;
    RevisionRepository.history(itemType, Number(itemId))
      .then((v) => {
        if (!cancelled) setNextVersion(v.length ? Math.max(...v.map((x) => x.versionNumber)) + 1 : 1);
      })
      .catch(() => {
        if (!cancelled) setNextVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, itemType, starting]);

  const chooseFile = async (picked: File | null) => {
    setFileError(null);
    if (!picked) return;
    try {
      const max = await getMaxUploadBytes();
      if (picked.size > max) {
        setFileError(`${picked.name} is ${formatBytes(picked.size)}; the limit is ${formatBytes(max)}.`);
        return;
      }
    } catch {
      /* the upload itself re-checks */
    }
    setFile(picked);
  };

  const missing =
    !project || (!itemId && !starting) || (starting && newTitle.trim().length < 2) || summary.trim().length < 5 || !file;

  const submit = async () => {
    setTried(true);
    if (missing || !file) return;
    const created = await c.create(
      {
        projectCode: project,
        itemType,
        ...(starting ? { newItem: { title: newTitle.trim() } } : { itemId: Number(itemId) }),
        versionLabel: label.trim() || undefined,
        changeSummary: summary.trim(),
      },
      file,
    );
    if (created) {
      toast.success(`Version ${created.versionNumber} recorded`);
      onCreated(created);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !c.submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create revision</DialogTitle>
          <DialogDescription>
            Upload a new version. Earlier versions are kept and the previous one is marked superseded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <ProjectPicker
              value={project}
              onChange={(code) => {
                setProject(code);
                setItemId("");
              }}
              allowedCodes={user?.role === "architect" ? staffedCodes : undefined}
              disabled={!!initial || c.submitting}
              className="w-full"
            />
            {tried && !project && <p className="text-xs text-destructive-strong">Select a project.</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rev-type">Item type</Label>
              <Select
                value={itemType}
                onValueChange={(v) => {
                  setItemType(v as RevisionItemType);
                  setItemId("");
                }}
                disabled={!!initial || c.submitting}
              >
                <SelectTrigger id="rev-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REVISION_ITEM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ITEM_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Item</Label>
              <SearchableSelect
                value={itemId || undefined}
                onValueChange={setItemId}
                disabled={!project || !!initial || c.submitting}
                loading={optionsLoading}
                className="w-full"
                options={[
                  ...(itemType === "plan" ? [{ value: NEW_PLAN, label: "＋ Start a new plan" }] : []),
                  ...options.map((o) => ({ value: String(o.id), label: o.label })),
                ]}
                placeholder={project ? "Select an item" : "Choose a project first"}
                searchPlaceholder="Search items…"
                emptyText={`No ${ITEM_TYPE_LABEL[itemType].toLowerCase()}s on this project`}
              />
              {tried && !itemId && <p className="text-xs text-destructive-strong">Select the item this version belongs to.</p>}
            </div>
          </div>

          {starting && (
            <div className="space-y-1.5">
              <Label htmlFor="rev-new-title">New plan title</Label>
              <Input id="rev-new-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ground floor plan" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rev-label">Version label (optional)</Label>
              <Input id="rev-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Rev B" maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label>Version number</Label>
              <div className="flex h-9 items-center rounded-xl border bg-muted/40 px-3 text-sm" aria-live="polite">
                {nextVersion != null ? `v${nextVersion} (assigned automatically)` : "Assigned when you save"}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rev-summary">
              What changed and why <span className="text-destructive-strong">*</span>
            </Label>
            <Textarea
              id="rev-summary"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              aria-invalid={tried && summary.trim().length < 5}
              placeholder="Moved the stair core 1.2 m east after the structural review."
            />
            {tried && summary.trim().length < 5 && <p className="text-xs text-destructive-strong">Describe the change (at least 5 characters).</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rev-file">
              File <span className="text-destructive-strong">*</span>
            </Label>
            <div className="flex items-center gap-2 rounded-xl border border-dashed p-3">
              <input
                ref={input}
                id="rev-file"
                type="file"
                accept={ACCEPT}
                className="sr-only"
                disabled={c.submitting}
                onChange={(e) => {
                  void chooseFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <Button type="button" variant="outline" size="sm" disabled={c.submitting} onClick={() => input.current?.click()}>
                <Paperclip className="h-3.5 w-3.5" /> {file ? "Change file" : "Choose file"}
              </Button>
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {file ? `${file.name} (${formatBytes(file.size)})` : `PDF, DWG/DXF, Office or image${maxLabel ? ` · up to ${maxLabel}` : ""}`}
              </span>
            </div>
            {tried && !file && !fileError && <p className="text-xs text-destructive-strong">Attach the file for this version.</p>}
            {fileError && (
              <p role="alert" className="text-xs text-destructive-strong">
                {fileError}
              </p>
            )}
            {c.progress != null && (
              <div className="space-y-1" role="status" aria-live="polite">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Uploading…</span>
                  <span className="tabular-nums">{c.progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${c.progress}%` }} />
                </div>
              </div>
            )}
          </div>

          {c.error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-strong">
              {c.error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={c.submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={c.submitting} onClick={() => void submit()}>
            <Plus className="h-4 w-4" /> {c.submitting ? "Saving…" : "Create revision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
