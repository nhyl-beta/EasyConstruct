import { useState, type FormEvent } from "react";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  CreateEngineeringReportInput,
  EngineeringReport,
  EngineeringReportType,
  ReportPriority,
  ReportStatus,
} from "@/features/engineering-reports/types/engineering-reports.types";
import { REPORT_PRIORITIES } from "@/features/engineering-reports/types/engineering-reports.types";
import { ProjectPicker } from "@/components/shared/project-picker";

const TODAY = () => new Date().toISOString().slice(0, 10);

export const PRIORITY_TONE: Record<ReportPriority, string> = {
  Low: "bg-muted text-muted-foreground border-border",
  Medium: "bg-primary-soft/60 text-primary-strong border-primary/20",
  High: "bg-warning/15 text-warning-strong border-warning/30",
  Critical: "bg-destructive/10 text-destructive-strong border-destructive/20",
};

export const STATUS_TONE: Record<ReportStatus, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  Submitted: "bg-primary-soft/60 text-primary-strong border-primary/20",
  "Under Review": "bg-warning/15 text-warning-strong border-warning/30",
  Approved: "bg-success/10 text-success-strong border-success/20",
  Rejected: "bg-destructive/10 text-destructive-strong border-destructive/20",
  "Revision Required": "bg-warning/15 text-warning-strong border-warning/30",
};

export function PriorityBadge({ priority }: { priority: ReportPriority }) {
  return (
    <Badge
      variant="outline"
      className={`rounded-full px-2.5 py-0.5 text-overline font-medium ${PRIORITY_TONE[priority]}`}
    >
      {priority}
    </Badge>
  );
}

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return (
    <Badge
      variant="outline"
      className={`rounded-full px-2.5 py-0.5 text-overline font-medium ${STATUS_TONE[status]}`}
    >
      {status}
    </Badge>
  );
}

const DETAIL_TEXT_FIELDS: { label: string; key: keyof EngineeringReport }[] = [
  { label: "Description", key: "description" },
  { label: "Findings", key: "findings" },
  { label: "Measurements", key: "measurements" },
  { label: "Observations", key: "observations" },
  { label: "Recommendations", key: "recommendations" },
  { label: "Required actions", key: "requiredActions" },
];

/**
 * Read-only view of every field of an engineering report. Engineers file
 * reports but cannot decide them, so there are deliberately no decision
 * buttons here (the PM decides on the Approvals page).
 */
export function ReportDetailDialog({
  report,
  onOpenChange,
}: {
  report: EngineeringReport | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={report !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {report && (
          <>
            <DialogHeader>
              <DialogTitle>{report.title}</DialogTitle>
              <p className="font-mono text-xs text-muted-foreground">{report.id}</p>
            </DialogHeader>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Type</dt>
                <dd>{report.type}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Project</dt>
                <dd>{report.project}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Location</dt>
                <dd>{report.location || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Date</dt>
                <dd>{report.date || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Engineer</dt>
                <dd>{report.engineer}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Priority</dt>
                <dd><PriorityBadge priority={report.priority} /></dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Status</dt>
                <dd><ReportStatusBadge status={report.status} /></dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last updated</dt>
                <dd>{report.updatedAgo}</dd>
              </div>
            </dl>
            <div className="space-y-3">
              {DETAIL_TEXT_FIELDS.map(({ label, key }) => (
                <div key={key}>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <p className="whitespace-pre-line text-sm">{(report[key] as string | undefined)?.trim() || "—"}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Shared "New report" dialog for both the Progress and Issues pages.
// `typeOptions` scopes the dropdown to whichever report taxonomy that
// page cares about, per EngineeringReportService.onlyProgress/onlyIssues.
export function NewReportDialog({
  typeOptions,
  triggerLabel = "New report",
  createReport,
  engineerName,
}: {
  typeOptions: EngineeringReportType[];
  triggerLabel?: string;
  createReport: (payload: CreateEngineeringReportInput) => Promise<void>;
  engineerName: string;
}) {
  const [open, setOpen] = useState(false);
  useOpenOnAction("new-report", () => setOpen(true));
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    type: "" as EngineeringReportType | "",
    priority: "Medium" as ReportPriority,
    project: "",
    location: "",
    date: TODAY(),
    description: "",
    findings: "",
    measurements: "",
    recommendations: "",
    requiredActions: "",
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const reset = () =>
    setForm({
      title: "",
      type: "",
      priority: "Medium",
      project: "",
      location: "",
      date: TODAY(),
      description: "",
      findings: "",
      measurements: "",
      recommendations: "",
      requiredActions: "",
    });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.type || !form.title || !form.project || !form.location) return;
    setSubmitting(true);
    try {
      await createReport({
        title: form.title,
        type: form.type,
        priority: form.priority,
        // Exactly as picked: project codes are case-sensitive keys (e.g. "Zh-01"), and
        // upper-casing one filed the report against a project that does not exist,
        // so it never reached the Project Manager.
        project: form.project,
        location: form.location,
        date: form.date || TODAY(),
        engineer: engineerName,
        description: form.description,
        findings: form.findings,
        measurements: form.measurements || undefined,
        recommendations: form.recommendations,
        requiredActions: form.requiredActions || undefined,
      });
      toast.success("Report submitted");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New engineering report</DialogTitle>
        </DialogHeader>
        <form className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="report-title">Report title</Label>
            <Input
              id="report-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Foundation cure inspection — zone B"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Report type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => set("type", v as EngineeringReportType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => set("priority", v as ReportPriority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="report-project">Project code</Label>
              <ProjectPicker
                value={form.project}
                onChange={(code) => set("project", code)}
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-location">Location / zone</Label>
              <Input
                id="report-location"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Zone B, Level 3"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-date">Report date</Label>
            <DatePicker
              id="report-date"
              value={form.date}
              onChange={(v) => set("date", v)}
              placeholder="Select report date"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-description">Description</Label>
            <Textarea
              id="report-description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-findings">Findings</Label>
            <Textarea
              id="report-findings"
              value={form.findings}
              onChange={(e) => set("findings", e.target.value)}
              rows={2}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-recommendations">Recommendations</Label>
            <Textarea
              id="report-recommendations"
              value={form.recommendations}
              onChange={(e) => set("recommendations", e.target.value)}
              rows={2}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="report-actions">Required actions (optional)</Label>
            <Textarea
              id="report-actions"
              value={form.requiredActions}
              onChange={(e) => set("requiredActions", e.target.value)}
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}