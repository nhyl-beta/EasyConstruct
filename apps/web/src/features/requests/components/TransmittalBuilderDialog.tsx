import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ProjectPicker } from "@/components/shared/project-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRequests } from "../hooks/useRequests";
import { TransmittalRepository } from "../repositories/request.repository";
import { TRANSMITTAL_PURPOSES, type Transmittal } from "../types/request.types";

interface Row {
  requestId?: number;
  particulars: string;
  remarks: string;
}

/** Cover-sheet builder: pick the project's requests to send out, then fill To / Thru / purposes. */
export function TransmittalBuilderDialog({
  open,
  onOpenChange,
  initialProject,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProject?: string;
  onCreated: (t: Transmittal) => void;
}) {
  const [project, setProject] = useState("");
  const [toName, setToName] = useState("");
  const [thruName, setThruName] = useState("");
  const [type, setType] = useState<"inter-office" | "inter-agency">("inter-office");
  const [subject, setSubject] = useState("");
  const [location, setLocation] = useState("");
  const [purposes, setPurposes] = useState<string[]>([]);
  const [purposeOther, setPurposeOther] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { requests } = useRequests({ projectCode: project || undefined });
  const candidates = useMemo(() => (project ? requests.filter((r) => r.status !== "draft") : []), [requests, project]);

  useEffect(() => {
    if (!open) return;
    setProject(initialProject ?? "");
    setToName("");
    setThruName("");
    setType("inter-office");
    setSubject("");
    setLocation("");
    setPurposes([]);
    setPurposeOther("");
    setRows([]);
    setTried(false);
    setError(null);
  }, [open, initialProject]);

  const togglePurpose = (v: string) => setPurposes((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  const picked = (id: number) => rows.some((r) => r.requestId === id);
  const toggleRequest = (id: number, label: string) =>
    setRows((cur) => (cur.some((r) => r.requestId === id) ? cur.filter((r) => r.requestId !== id) : [...cur, { requestId: id, particulars: label, remarks: "" }]));

  const invalid = !project || toName.trim().length < 2 || subject.trim().length < 3 || rows.length === 0 || rows.some((r) => !r.particulars.trim());

  const submit = async () => {
    setTried(true);
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      const created = await TransmittalRepository.create({
        projectCode: project,
        toName: toName.trim(),
        thruName: thruName.trim() || undefined,
        type,
        subject: subject.trim(),
        location: location.trim() || undefined,
        purposes,
        purposeOther: purposes.includes("others") ? purposeOther.trim() || undefined : undefined,
        items: rows.map((r) => ({ requestId: r.requestId, particulars: r.particulars.trim(), remarks: r.remarks.trim() || undefined })),
      });
      toast.success(`Transmittal ${created.controlNo} created`);
      onCreated(created);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the transmittal");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New transmittal</DialogTitle>
          <DialogDescription>The cover sheet that goes out with the documents. The control number is assigned automatically.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <ProjectPicker value={project} onChange={(c) => { setProject(c); setRows([]); }} disabled={!!initialProject || busy} className="w-full" />
            {tried && !project && <p className="text-xs text-destructive-strong">Select a project.</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tr-to">To <span className="text-destructive-strong">*</span></Label>
              <Input id="tr-to" value={toName} onChange={(e) => setToName(e.target.value)} disabled={busy} aria-invalid={tried && toName.trim().length < 2} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-thru">Thru</Label>
              <Input id="tr-thru" value={thruName} onChange={(e) => setThruName(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)} disabled={busy}>
                <SelectTrigger id="tr-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inter-office">Inter-office</SelectItem>
                  <SelectItem value="inter-agency">Inter-agency</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-loc">Location</Label>
              <Input id="tr-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Defaults to the project location" disabled={busy} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr-subject">Subject <span className="text-destructive-strong">*</span></Label>
            <Input id="tr-subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} aria-invalid={tried && subject.trim().length < 3} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Purpose</legend>
            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {TRANSMITTAL_PURPOSES.map((p) => (
                <label key={p.value} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={purposes.includes(p.value)} onCheckedChange={() => togglePurpose(p.value)} disabled={busy} />
                  {p.label}
                </label>
              ))}
            </div>
            {purposes.includes("others") && <Input value={purposeOther} onChange={(e) => setPurposeOther(e.target.value)} placeholder="Other purpose" aria-label="Other purpose" disabled={busy} />}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Items <span className="text-destructive-strong">*</span>
            </legend>
            {project && candidates.length === 0 && <p className="text-xs text-muted-foreground">This project has no sent requests yet — add items by hand below.</p>}
            {candidates.length > 0 && (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border p-2">
                {candidates.map((r) => (
                  <label key={r.id} className="flex items-start gap-2 text-sm">
                    <Checkbox checked={picked(r.id)} onCheckedChange={() => toggleRequest(r.id, `${r.number} — ${r.subject}`)} disabled={busy} className="mt-0.5" />
                    <span>
                      <span className="font-mono text-xs">{r.number}</span> {r.subject}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_9rem_auto] items-center gap-2">
                  <Input value={row.particulars} onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, particulars: e.target.value } : x)))} aria-label={`Particulars ${i + 1}`} disabled={busy} />
                  <Input value={row.remarks} onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, remarks: e.target.value } : x)))} placeholder="Remarks" aria-label={`Remarks ${i + 1}`} disabled={busy} />
                  <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Remove item ${i + 1}`} onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))} disabled={busy}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setRows((cur) => [...cur, { particulars: "", remarks: "" }])} disabled={busy}>
                <Plus className="h-3.5 w-3.5" /> Add item
              </Button>
            </div>
            {tried && rows.length === 0 && <p className="text-xs text-destructive-strong">Add at least one item.</p>}
          </fieldset>

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
            {busy ? "Saving…" : "Create transmittal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
