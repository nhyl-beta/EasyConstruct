import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface DecisionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Label above the note box. */
  noteLabel?: string;
  /** The note must be filled in before the button works. */
  noteRequired?: boolean;
  confirmLabel: string;
  destructive?: boolean;
  /** Return an error message to keep the dialog open, or null when it worked. */
  onSubmit: (note: string) => Promise<string | null>;
  /** Extra fields shown above the note. */
  children?: ReactNode;
  /** Disable the button for a reason the children know about (an invalid field). */
  disabled?: boolean;
  /** Hide the note box (a dialog that only needs its own fields). */
  hideNote?: boolean;
}

/** A confirmation with a note box. ConfirmDialog has no field, and a rejection needs a reason. */
export function DecisionDialog({
  open,
  onOpenChange,
  title,
  description,
  noteLabel = "Note",
  noteRequired = false,
  confirmLabel,
  destructive = false,
  onSubmit,
  children,
  disabled = false,
  hideNote = false,
}: DecisionDialogProps) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
    }
  }, [open]);

  const canSubmit = !busy && !disabled && (hideNote || !noteRequired || note.trim().length > 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const message = await onSubmit(note.trim());
    setBusy(false);
    if (message) setError(message);
    else onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4">
          {children}
          {!hideNote && (
            <div className="space-y-1.5">
              <Label htmlFor="decision-note">
                {noteLabel}
                {noteRequired ? " (required)" : " (optional)"}
              </Label>
              <Textarea id="decision-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive-strong">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
