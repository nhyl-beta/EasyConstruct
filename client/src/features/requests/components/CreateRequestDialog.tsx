import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { responseWindowProblem } from "../lib/response-window";

import { useAuth } from "@/auth/auth-context";
import { ProjectPicker } from "@/components/shared/project-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAssignees } from "../hooks/useRequests";
import { RequestRepository } from "../repositories/request.repository";
import {
  DISCIPLINES,
  DISCIPLINE_LABEL,
  type DesignRequest,
  type Impact,
  type RequestDiscipline,
  type RequestKind,
} from "../types/request.types";
import { RequestFilePicker, uploadAll } from "./RequestFilePicker";
import { Checkbox } from "@/components/ui/checkbox";
import { useStakeholders } from "@/features/stakeholders/hooks/use-stakeholders";

export interface CreateRequestInitial {
  projectCode?: string;
  designId?: number;
  kind?: RequestKind;
  discipline?: RequestDiscipline;
  subject?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: CreateRequestInitial | null;
  onCreated: (request: DesignRequest) => void;
}

/** The "Send to" value that means the project's client (everything else is an assignee's user id). */
const CLIENT_OPTION = "client";
const emailSchema = z.string().trim().email("Enter a valid email address");

const IMPACT_LABEL: Record<Impact, string> = { none: "None", increase: "Increase", decrease: "Decrease" };

/**
 * Raise an RFI or RFA (the J.D. Legaspi request form). A PM's request goes out
 * straight away; an Engineer's is saved as a draft the PM then sends.
 */
export function CreateRequestDialog({ open, onOpenChange, initial, onCreated }: Props) {
  const { user } = useAuth();
  const isEngineer = user?.role === "engineer";

  const [kind, setKind] = useState<RequestKind>("RFI");
  const [project, setProject] = useState("");
  const [discipline, setDiscipline] = useState<RequestDiscipline>("AR");
  const [sheets, setSheets] = useState("");
  const [subject, setSubject] = useState("");
  const [sections, setSections] = useState("");
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const [costImpact, setCostImpact] = useState<Impact>("none");
  const [costNote, setCostNote] = useState("");
  const [timeImpact, setTimeImpact] = useState<Impact>("none");
  const [timeDays, setTimeDays] = useState("");
  const [dueDays, setDueDays] = useState("");
  // Client request: the project's stakeholders to email (one copy each), and an optional extra address.
  const [stakeholderIds, setStakeholderIds] = useState<number[]>([]);
  const [extraEmail, setExtraEmail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [tried, setTried] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { assignees, loading: assigneesLoading } = useAssignees(project);
  const toClient = assignee === CLIENT_OPTION;
  const { items: stakeholders, loading: stakeholdersLoading, error: stakeholdersError } = useStakeholders(toClient && project ? project : null);

  // The project's Owner is pre-selected (when it has an email) the first time the client option is picked.
  useEffect(() => {
    if (!toClient) return;
    setStakeholderIds((prev) => {
      if (prev.length > 0) return prev;
      const owner = stakeholders.find((s) => s.role === "Owner" && s.hasEmail);
      return owner ? [owner.id] : prev;
    });
  }, [toClient, stakeholders]);

  useEffect(() => {
    if (!open) return;
    setKind(initial?.kind ?? "RFI");
    setProject(initial?.projectCode ?? "");
    setDiscipline(initial?.discipline ?? "AR");
    setSheets("");
    setSubject(initial?.subject ?? "");
    setSections("");
    setText("");
    setAssignee("");
    setStakeholderIds([]);
    setExtraEmail("");
    setCostImpact("none");
    setCostNote("");
    setTimeImpact("none");
    setTimeDays("");
    setDueDays("");
    setFiles([]);
    setTried(false);
    setError(null);
  }, [open, initial?.projectCode, initial?.kind, initial?.discipline, initial?.subject]);

  const defaultDays = kind === "RFI" ? 3 : 4;
  const dueProblem = responseWindowProblem(dueDays);
  const extraProblem = toClient && extraEmail.trim() ? (emailSchema.safeParse(extraEmail).error?.issues[0]?.message ?? null) : null;
  const recipientProblem = toClient && stakeholderIds.length === 0 && !extraEmail.trim() ? "Choose at least one stakeholder to send this to." : extraProblem;
  const invalid = !project || subject.trim().length < 3 || text.trim().length < 10 || !assignee || dueProblem !== null || recipientProblem !== null;

  const submit = async () => {
    setTried(true);
    if (invalid) return;
    setSubmitting(true);
    setError(null);
    try {
      const uploaded = files.length ? await uploadAll(files, setProgress) : [];
      const created = await RequestRepository.create({
        kind,
        projectCode: project,
        discipline,
        sheetNumbers: sheets.trim() || undefined,
        subject: subject.trim(),
        sectionsReferenced: sections.trim() || undefined,
        requestText: text.trim(),
        costImpact,
        costNote: costImpact !== "none" ? costNote.trim() || undefined : undefined,
        timeImpact,
        timeDays: timeImpact !== "none" && timeDays ? Number(timeDays) : undefined,
        recipientType: toClient ? "client" : "internal",
        ...(toClient
          ? { recipientStakeholderIds: stakeholderIds, ...(extraEmail.trim() ? { recipientEmail: extraEmail.trim() } : {}) }
          : { assignedToUserId: Number(assignee) }),
        dueDays: dueDays ? Number(dueDays) : undefined,
        designId: initial?.designId,
        files: uploaded,
      });
      toast.success(created.status === "draft" ? `${created.number} saved as a draft for the PM to send` : `${created.number} sent`);
      onCreated(created);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not raise the request");
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Raise a {kind === "RFI" ? "Request for Information" : "Request for Approval"}</DialogTitle>
          <DialogDescription>
            {isEngineer
              ? "Saved as a draft. The Project Manager countersigns and sends it to the designer."
              : toClient
                ? "Emailed to the client with a response deadline. Their reply comes to your own mailbox."
                : "Goes straight to the Architect or Consultant you choose, with a response deadline."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="rq-kind">Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as RequestKind)} disabled={submitting}>
                <SelectTrigger id="rq-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RFI">RFI — information</SelectItem>
                  <SelectItem value="RFA">RFA — approval</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Project</Label>
              <ProjectPicker
                value={project}
                onChange={(c) => {
                  setProject(c);
                  setAssignee("");
                  setStakeholderIds([]);
                  setExtraEmail("");
                }}
                disabled={!!initial?.projectCode || submitting}
                className="w-full"
              />
              {tried && !project && <p className="text-xs text-destructive-strong">Select a project.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="rq-disc">Discipline</Label>
              <Select value={discipline} onValueChange={(v) => setDiscipline(v as RequestDiscipline)} disabled={submitting}>
                <SelectTrigger id="rq-disc" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCIPLINES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d} — {DISCIPLINE_LABEL[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-sheets">Drawing sheet no.</Label>
              <Input id="rq-sheets" value={sheets} onChange={(e) => setSheets(e.target.value)} placeholder="A-2c to A-2i" maxLength={255} disabled={submitting} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-sections">Section(s) referenced</Label>
              <Input id="rq-sections" value={sections} onChange={(e) => setSections(e.target.value)} placeholder="Door schedule, Sec. 3" maxLength={255} disabled={submitting} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rq-subject">
              Overview (subject) <span className="text-destructive-strong">*</span>
            </Label>
            <Input id="rq-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={255} disabled={submitting} aria-invalid={tried && subject.trim().length < 3} />
            {tried && subject.trim().length < 3 && <p className="text-xs text-destructive-strong">Give the request a short overview.</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rq-text">
              {kind === "RFI" ? "Clarification required" : "Approval requested"} <span className="text-destructive-strong">*</span>
            </Label>
            <Textarea id="rq-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={submitting} aria-invalid={tried && text.trim().length < 10} />
            {tried && text.trim().length < 10 && <p className="text-xs text-destructive-strong">Describe the request (at least 10 characters).</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-xl border p-3">
              <Label htmlFor="rq-cost">Cost impact</Label>
              <Select value={costImpact} onValueChange={(v) => setCostImpact(v as Impact)} disabled={submitting}>
                <SelectTrigger id="rq-cost" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(IMPACT_LABEL) as Impact[]).map((i) => (
                    <SelectItem key={i} value={i}>
                      {IMPACT_LABEL[i]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {costImpact !== "none" && (
                <Input value={costNote} onChange={(e) => setCostNote(e.target.value)} placeholder="Subject for variation / amount" maxLength={255} disabled={submitting} aria-label="Cost note" />
              )}
            </div>
            <div className="space-y-1.5 rounded-xl border p-3">
              <Label htmlFor="rq-time">Time impact</Label>
              <Select value={timeImpact} onValueChange={(v) => setTimeImpact(v as Impact)} disabled={submitting}>
                <SelectTrigger id="rq-time" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(IMPACT_LABEL) as Impact[]).map((i) => (
                    <SelectItem key={i} value={i}>
                      {IMPACT_LABEL[i]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {timeImpact !== "none" && (
                <Input type="number" min={0} value={timeDays} onChange={(e) => setTimeDays(e.target.value)} placeholder="Number of days" disabled={submitting} aria-label="Days of time impact" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>
                Send to <span className="text-destructive-strong">*</span>
              </Label>
              <Select value={assignee} onValueChange={setAssignee} disabled={!project || submitting}>
                <SelectTrigger className="w-full" aria-label="Assignee">
                  <SelectValue placeholder={!project ? "Choose a project first" : assigneesLoading ? "Loading…" : "Architect, Consultant or Client"} />
                </SelectTrigger>
                <SelectContent>
                  {assignees.map((a) => (
                    <SelectItem key={a.userId} value={String(a.userId)}>
                      {a.name} · {a.role}
                    </SelectItem>
                  ))}
                  <SelectItem value={CLIENT_OPTION}>Stakeholders outside the company (email)</SelectItem>
                </SelectContent>
              </Select>
              {tried && !assignee && <p className="text-xs text-destructive-strong">Choose who should respond.</p>}
              {toClient && (
                <div className="space-y-2 pt-1">
                  <Label>
                    Stakeholders <span className="text-destructive-strong">*</span>
                  </Label>
                  {stakeholdersLoading && <p className="text-xs text-muted-foreground">Loading stakeholders…</p>}
                  {stakeholdersError && <p className="text-xs text-destructive-strong">Couldn&apos;t load stakeholders. {stakeholdersError}</p>}
                  {!stakeholdersLoading && !stakeholdersError && stakeholders.length === 0 && (
                    <p className="text-xs text-muted-foreground">This project has no stakeholders yet. Add them on the project page, or enter one address below.</p>
                  )}
                  <ul className="space-y-1.5">
                    {stakeholders.map((s) => (
                      <li key={s.id} className="flex items-start gap-2">
                        <Checkbox
                          id={`rq-sh-${s.id}`}
                          checked={stakeholderIds.includes(s.id)}
                          disabled={!s.hasEmail || submitting}
                          onCheckedChange={(v) => setStakeholderIds((prev) => (v === true ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                        />
                        <Label htmlFor={`rq-sh-${s.id}`} className="flex-1 text-sm font-normal leading-tight">
                          {s.name}
                          {s.company ? ` (${s.company})` : ""} <span className="text-xs text-muted-foreground">· {s.role}</span>
                          {!s.hasEmail && <span className="block text-xs text-warning-strong">No email on file</span>}
                        </Label>
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-1.5">
                    <Label htmlFor="rq-extra-email" className="text-xs text-muted-foreground">
                      Another address (optional)
                    </Label>
                    <Input
                      id="rq-extra-email"
                      type="email"
                      value={extraEmail}
                      onChange={(e) => setExtraEmail(e.target.value)}
                      placeholder="someone@company.com"
                      maxLength={255}
                      disabled={submitting}
                      aria-invalid={extraProblem !== null}
                    />
                  </div>
                  {recipientProblem && (tried || stakeholderIds.length > 0 || extraEmail.length > 0) && <p className="text-xs text-destructive-strong">{recipientProblem}</p>}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rq-due">Response window (days)</Label>
              <Input
                id="rq-due"
                type="number"
                min={1}
                max={60}
                step={1}
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value)}
                placeholder={`${defaultDays} (default)`}
                disabled={submitting}
                aria-invalid={dueProblem !== null}
                aria-describedby={dueProblem ? "rq-due-error" : undefined}
              />
              {dueProblem && (
                <p id="rq-due-error" className="text-xs text-destructive-strong">
                  {dueProblem}
                </p>
              )}
            </div>
          </div>

          <RequestFilePicker files={files} onChange={setFiles} disabled={submitting} />
          {progress != null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="status" aria-label="Upload progress">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-strong">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={submitting} onClick={() => void submit()}>
            <Send className="h-4 w-4" /> {submitting ? "Saving…" : isEngineer ? "Save draft" : `Send ${kind}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
