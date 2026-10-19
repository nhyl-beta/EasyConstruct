import { useState } from "react";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectPicker } from "@/components/shared/project-picker";
import { uploadsRepository } from "@/features/uploads/repositories/uploads.repository";
import { issuesRepository } from "../repositories/issues.repository";

const CATEGORIES = ["Technical", "Structural", "Material", "Schedule", "Resource", "Quality", "Safety", "Other"];
const SEVERITIES = ["Low", "Medium", "High", "Critical"];

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });

const EMPTY = {
  projectCode: "",
  title: "",
  category: "Technical",
  severity: "Medium",
  description: "",
  siteContext: "",
};

/**
 * Engineer-side "Report issue": same POST /issues as the Site Personnel form.
 * The server stamps reporter id/role from the signed-in user and refuses
 * archived/closed projects — that message is shown inline.
 */
export function ReportIssueDialog({
  staffedCodes,
  onReported,
}: {
  /** Projects the engineer is staffed on; the picker offers only these. */
  staffedCodes: string[];
  onReported: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  useOpenOnAction("report-issue", () => setOpen(true));
  const [form, setForm] = useState(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = form.projectCode && form.title.trim().length >= 2 && form.description.trim().length >= 5;

  const reset = () => {
    setForm(EMPTY);
    setFile(null);
    setError(null);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      let attachmentUrl: string | undefined;
      if (file) {
        const res = await uploadsRepository.upload(file.name, file.type || "application/octet-stream", await readAsDataUrl(file));
        attachmentUrl = res.data.url;
      }
      await issuesRepository.create({
        issueCode: `ISS-${Date.now()}`,
        projectCode: form.projectCode,
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        severity: form.severity,
        siteContext: form.siteContext.trim() || undefined,
        attachmentUrl,
      });
      toast.success("Issue reported");
      reset();
      setOpen(false);
      await onReported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to report issue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(null); }}>
      <DialogTrigger asChild>
        <Button>Report issue</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a technical issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project</Label>
            <ProjectPicker
              value={form.projectCode}
              onChange={(code) => setForm((f) => ({ ...f, projectCode: code }))}
              allowedCodes={staffedCodes}
              className="w-full"
            />
            {staffedCodes.length === 0 && (
              <p className="text-xs text-muted-foreground">You are not staffed on any project yet.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issue-title">Title</Label>
            <Input id="issue-title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Cracks on slab surface after curing" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select value={form.severity} onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issue-description">Description</Label>
            <Textarea id="issue-description" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What did you observe? What is affected?" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issue-context">Site / location context (optional)</Label>
            <Input id="issue-context" value={form.siteContext} onChange={(e) => setForm((f) => ({ ...f, siteContext: e.target.value }))} placeholder="Zone B, Level 4" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issue-file">Attachment (optional)</Label>
            <Input id="issue-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-strong">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button disabled={!canSubmit || submitting} onClick={() => void submit()}>
            {submitting ? "Submitting…" : "Submit issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
