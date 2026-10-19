// Asks an Admin for the written reason that an override needs (client demo change #9). Approving a
// requirement or sending an RFI/RFA belongs to the project's PM; an Admin can step in only with a reason of at
// least 10 characters, which is kept in the audit trail.
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const MIN_OVERRIDE_REASON = 10;

export function OverrideReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy = false,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const long = reason.trim().length >= MIN_OVERRIDE_REASON;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5 py-2">
          <Label htmlFor="override-reason">Reason (kept in the audit trail)</Label>
          <Textarea id="override-reason" rows={3} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} disabled={busy} placeholder="Why are you doing this instead of the Project Manager?" />
          <p className={`text-xs ${long || reason.length === 0 ? "text-muted-foreground" : "text-destructive-strong"}`}>At least {MIN_OVERRIDE_REASON} characters ({reason.trim().length} so far).</p>
          {error && (
            <p role="alert" className="text-sm text-destructive-strong">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(reason.trim())} disabled={busy || !long}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
