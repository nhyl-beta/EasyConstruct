// apps/web/src/components/tasks/complete-task-dialog.tsx
//
// Marking a task done used to be a bare status flip, which recorded that the
// work finished but nothing about what was actually done — so Engineering had
// no way to review field work after the fact. Completing now captures a
// required note and an optional photo/document, stored on the task itself
// (tasks.completion_note / completion_file_url / completed_at).
import { useEffect, useState } from "react";
import { Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUploadFile } from "@/features/uploads/hooks/use-upload-file";
import type { TaskRecord } from "@/features/tasks/repositories/task.repository";

interface CompleteTaskDialogProps {
  /** null closes the dialog; a task opens it for that task. */
  task: TaskRecord | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    task: TaskRecord,
    completion: { completionNote: string; completionFileUrl?: string },
  ) => Promise<unknown>;
}

export function CompleteTaskDialog({
  task,
  onOpenChange,
  onConfirm,
}: CompleteTaskDialogProps) {
  const { uploadFile, uploading } = useUploadFile();
  const [note, setNote] = useState("");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reused across tasks, so the fields reseed each time it opens rather than
  // on mount — same reason as edit-workflow-dialog.tsx.
  useEffect(() => {
    if (!task) return;
    setNote("");
    setFileUrl(null);
    setFileName(null);
    setError(null);
  }, [task]);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const url = await uploadFile(file);
      setFileUrl(url);
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const submit = async () => {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      await onConfirm(task, {
        completionNote: note.trim(),
        completionFileUrl: fileUrl ?? undefined,
      });
      onOpenChange(false);
    } catch (e) {
      // Keep the dialog open so the note isn't lost on a failed save.
      setError(e instanceof Error ? e.message : "Couldn't complete the task");
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || uploading;

  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Complete task</DialogTitle>
          <DialogDescription>
            {task
              ? `${task.taskCode} · ${task.title}`
              : "Describe the work you finished."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <p role="alert" className="text-sm text-destructive-strong">
              {error}
            </p>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="task-completion-note">
              What was completed <span className="text-destructive-strong">*</span>
            </Label>
            <Textarea
              id="task-completion-note"
              value={note}
              disabled={busy}
              rows={4}
              placeholder="Describe the work carried out, materials used, and anything the next shift should know."
              onChange={(e) => setNote(e.target.value)}
             
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="task-completion-file">Attachment (optional)</Label>
            {fileUrl ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span className="truncate">{fileName}</span>
                <button
                  type="button"
                  aria-label="Remove attachment"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setFileUrl(null);
                    setFileName(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/40">
                <Paperclip className="h-4 w-4" />
                {uploading ? "Uploading…" : "Attach a photo or document"}
                <input
                  id="task-completion-file"
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf"
                  disabled={busy}
                  onChange={(e) => void pickFile(e.target.files?.[0])}
                />
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || note.trim() === ""} onClick={submit}>
            {saving ? "Saving…" : "Mark complete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

CompleteTaskDialog.displayName = "CompleteTaskDialog";
