import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RequestRepository } from "../repositories/request.repository";
import { RFA_OUTCOMES, STATUS_LABEL, type DesignRequest, type RfaOutcome } from "../types/request.types";
import { RequestFilePicker, uploadAll } from "./RequestFilePicker";

/** The assignee's answer: text, files (e.g. AID-2a-1) and, for an RFA, the outcome. */
export function RespondDialog({
  request,
  open,
  onOpenChange,
  onDone,
}: {
  request: Pick<DesignRequest, "id" | "kind" | "number" | "subject">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<RfaOutcome | "">("");
  const [files, setFiles] = useState<File[]>([]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setText("");
    setOutcome("");
    setFiles([]);
    setTried(false);
    setError(null);
  }, [open]);

  const isRfa = request.kind === "RFA";
  const invalid = text.trim().length < 3 || (isRfa && !outcome);

  const submit = async () => {
    setTried(true);
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = files.length ? await uploadAll(files) : [];
      await RequestRepository.respond(request.id, {
        responseText: text.trim(),
        outcome: isRfa ? (outcome as RfaOutcome) : undefined,
        files: uploaded,
      });
      toast.success(`${request.number} ${isRfa ? STATUS_LABEL[outcome as RfaOutcome].toLowerCase() : "answered"}`);
      onDone();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record the response");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Respond to {request.number}</DialogTitle>
          <DialogDescription>{request.subject}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isRfa && (
            <div className="space-y-1.5">
              <Label htmlFor="rs-outcome">
                Outcome <span className="text-destructive-strong">*</span>
              </Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as RfaOutcome)} disabled={busy}>
                <SelectTrigger id="rs-outcome" className="w-full">
                  <SelectValue placeholder="Approved, approved as noted or rejected" />
                </SelectTrigger>
                <SelectContent>
                  {RFA_OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {STATUS_LABEL[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tried && !outcome && <p className="text-xs text-destructive-strong">Choose an outcome.</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="rs-text">
              Response <span className="text-destructive-strong">*</span>
            </Label>
            <Textarea id="rs-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} aria-invalid={tried && text.trim().length < 3} />
            {tried && text.trim().length < 3 && <p className="text-xs text-destructive-strong">Write your response.</p>}
          </div>
          <RequestFilePicker files={files} onChange={setFiles} disabled={busy} label="Response attachments (e.g. AID-2a-1)" />
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-strong">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            <CheckCircle2 className="h-4 w-4" /> {busy ? "Saving…" : "Submit response"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
