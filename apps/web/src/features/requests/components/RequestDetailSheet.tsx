import { useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, CornerDownRight, FileDown, FilePlus2, MailCheck, Printer, RefreshCw, Send, XCircle } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/auth-context";
import { NewWorkflowDialog } from "@/components/workflows/new-workflow-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useWorkflowTemplates } from "@/features/workflows/hooks/useWorkflows";
import { downloadFileUrl } from "@/lib/file-url";
import { useMarkClientReplied, useRequestDetail, useResendRequestEmail } from "../hooks/useRequests";
import { RequestRepository } from "../repositories/request.repository";
import { DISCIPLINE_LABEL, MAX_EMAIL_RESENDS, STATUS_LABEL, type DesignRequestDetail, type RequestFile } from "../types/request.types";
import { EmailStatusBadge, formatDate, formatDateTime, KindBadge, OverdueBadge, RecipientBadge, RequestStatusBadge } from "./RequestBadges";
import { RequestFilePicker, uploadAll } from "./RequestFilePicker";
import { RespondDialog } from "./RespondDialog";
import { FileIntegrityBadge } from "@/features/uploads/components/FileIntegrityBadge";
import { RecipientsList } from "./RecipientsList";
import { OverrideReasonDialog } from "@/components/shared/override-reason-dialog";

const RAISERS = new Set(["project-manager", "engineer", "admin"]);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-overline text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children || "—"}</dd>
    </div>
  );
}

function Files({ files, stage }: { files: RequestFile[]; stage: "request" | "response" }) {
  const rows = files.filter((f) => f.stage === stage);
  if (rows.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {rows.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs">
          <span className="min-w-0 truncate">{f.filename}</span>
          <FileIntegrityBadge url={f.url} />
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 text-primary-strong hover:underline"
            onClick={() => void downloadFileUrl(f.url, f.filename).catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Could not download the file"))}
          >
            <FileDown className="h-3.5 w-3.5" /> Download
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One request in full, with the actions the signed-in role may take on it. */
export function RequestDetailSheet({
  id,
  onOpenChange,
  onChanged,
}: {
  id: number | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { request: r, loading, error, reload } = useRequestDetail(id);
  const [busy, setBusy] = useState(false);
  const [responding, setResponding] = useState(false);
  const [closing, setClosing] = useState(false);
  const [followingUp, setFollowingUp] = useState(false);
  const [changeOrder, setChangeOrder] = useState(false);
  const templates = useWorkflowTemplates();

  const role = user?.role ?? "";
  const isAdmin = role === "admin";
  const done = () => {
    reload();
    onChanged();
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      done();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That did not work");
    } finally {
      setBusy(false);
    }
  };

  const isClient = r?.recipientType === "client";
  // A client request has no assignee: the sender, the PM and the Admin handle it.
  const handlesClient = !!r && isClient && (isAdmin || role === "project-manager" || r.requestedByUserId === user?.id);
  const clientActive = !!r && (r.status === "open" || r.status === "client_replied");
  const mineToAnswer = !!r && (isClient
    ? handlesClient && clientActive
    : (isAdmin || r.assignedToUserId === user?.id) && (r.status === "open" || r.status === "in_review"));
  const canMarkReplied = handlesClient && r?.status === "open";
  const resendsLeft = r ? MAX_EMAIL_RESENDS - r.emailResendCount : 0;
  // With a recipients list each person has their own Resend; this one is only for older requests without it.
  const canResend = handlesClient && clientActive && (r?.recipients.length ?? 0) === 0 && r?.emailStatus === "failed" && resendsLeft > 0;
  const resend = useResendRequestEmail(() => done());
  const replied = useMarkClientReplied(() => done());
  // Sending belongs to the project's PM. An Admin gets an Override that needs a written reason (change #9).
  const canSend = !!r && r.status === "draft" && role === "project-manager";
  const canOverrideSend = !!r && r.status === "draft" && isAdmin;
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const canClose = !!r && r.status !== "closed" && (isAdmin || role === "project-manager" || r.requestedByUserId === user?.id);
  const canFollowUp = !!r && RAISERS.has(role) && r.status !== "draft" && r.status !== "closed";
  const canRecordReturned = !!r && RAISERS.has(role) && r.kind === "RFA" && ["approved", "approved_as_noted", "rejected"].includes(r.status);
  const canChangeOrder = !!r && r.suggestsChangeOrder && ["project-manager", "admin", "engineer"].includes(role);

  return (
    <>
      <OverrideReasonDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        title="Override: send this request"
        description="Sending an RFI or RFA is the Project Manager's call. Give the reason you are sending it in their place; it is kept in the audit trail."
        confirmLabel="Send as Admin"
        busy={busy}
        error={overrideError}
        onConfirm={(reason) => {
          if (!r) return;
          setOverrideError(null);
          void RequestRepository.send(r.id, undefined, reason)
            .then(() => {
              toast.success(`${r.number} sent`);
              setOverrideOpen(false);
              done();
            })
            .catch((e: unknown) => setOverrideError(e instanceof Error ? e.message : "Could not send the request"));
        }}
      />
      <Sheet open={id !== null} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex flex-wrap items-center gap-2">
              {r ? r.number : "Request"}
              {r && <KindBadge kind={r.kind} />}
              {r && <RequestStatusBadge status={r.status} />}
              {r && <RecipientBadge request={r} showEmail />}
              {r && <EmailStatusBadge request={r} />}
              {r && <OverdueBadge request={r} />}
            </SheetTitle>
            <SheetDescription>{r ? `${r.projectCode} · ${DISCIPLINE_LABEL[r.discipline]}` : "Loading…"}</SheetDescription>
          </SheetHeader>

          <div className="space-y-5 px-4 pb-6">
            {loading && !r && <p className="text-sm text-muted-foreground">Loading request…</p>}
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-strong">
                {error}
              </p>
            )}
            {r && (
              <>
                <div>
                  <h3 className="text-sm font-semibold">{r.subject}</h3>
                  {r.followUpOf && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Follow-up to <span className="font-mono">{r.followUpOf.number}</span>
                    </p>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="Drawing sheet no.">{r.sheetNumbers}</Field>
                  <Field label="Section(s) referenced">{r.sectionsReferenced}</Field>
                  <Field label="Requested by">
                    {r.requestedByName} ({r.requestedByRole.replace("-", " ")})
                  </Field>
                  <Field label="Countersigned">{r.countersignedByName ? `${r.countersignedByName} · ${formatDate(r.countersignedAt)}` : "Not yet"}</Field>
                  {isClient ? (
                    <Field label="Sent to">{r.recipients.length > 0 ? `${r.recipients.length} stakeholder${r.recipients.length === 1 ? "" : "s"}` : r.recipientEmail}</Field>
                  ) : (
                    <Field label="Assigned to">{r.assignedToName}</Field>
                  )}
                  <Field label="Due">
                    {r.dueDate ? formatDate(r.dueDate) : "Starts when sent"}
                  </Field>
                  <Field label="Cost impact">
                    {r.costImpact === "none" ? "None" : `${r.costImpact}${r.costNote ? ` — ${r.costNote}` : ""}`}
                  </Field>
                  <Field label="Time impact">
                    {r.timeImpact === "none" ? "None" : `${r.timeImpact}${r.timeDays ? ` — ${r.timeDays} day(s)` : ""}`}
                  </Field>
                </dl>

                <section aria-label="Request">
                  <h4 className="text-xs font-medium text-muted-foreground">{r.kind === "RFI" ? "Clarification required" : "Approval requested"}</h4>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{r.requestText}</p>
                  <Files files={r.files} stage="request" />
                </section>

                <section aria-label="Response" className="rounded-xl border p-3">
                  <h4 className="text-xs font-medium text-muted-foreground">Response</h4>
                  {r.responseText ? (
                    <>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{r.responseText}</p>
                      <p className="mt-1 text-overline text-muted-foreground">
                        {r.respondedByName} · {formatDateTime(r.respondedAt)} · {STATUS_LABEL[r.status]}
                      </p>
                      <Files files={r.files} stage="response" />
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {r.status === "draft" ? "Not sent yet." : isClient ? "Waiting for the client's reply." : "Waiting for a response."}
                    </p>
                  )}
                </section>

                {r.kind === "RFA" && r.returnedByName && (
                  <section aria-label="Returned document" className="rounded-xl border p-3 text-sm">
                    <h4 className="text-xs font-medium text-muted-foreground">Returned document</h4>
                    <p className="mt-1">
                      {r.returnedByName}, {r.returnedByPosition} · {formatDateTime(r.returnedAt)}
                    </p>
                  </section>
                )}

                {r.followUps.length > 0 && (
                  <section aria-label="Follow-ups">
                    <h4 className="text-xs font-medium text-muted-foreground">Follow-ups</h4>
                    <ul className="mt-1 space-y-1">
                      {r.followUps.map((f) => (
                        <li key={f.id} className="flex items-center gap-2 text-sm">
                          <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-mono text-xs">{f.number}</span>
                          <RequestStatusBadge status={f.status} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {isClient && r.recipients.length > 0 && (
                  <RecipientsList requestId={r.id} recipients={r.recipients} canResend={handlesClient && clientActive} onChanged={done} />
                )}
                {isClient && r.recipients.length === 0 && r.emailStatus === "failed" && (
                  <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive-strong">
                    The email to {r.recipientEmail} could not be sent. The request is saved
                    {resendsLeft > 0 ? `; you can resend it (${resendsLeft} resend${resendsLeft === 1 ? "" : "s"} left).` : " and has used all its resends."}
                  </p>
                )}
                {resend.error && <p role="alert" className="text-xs text-destructive-strong">{resend.error}</p>}
                {replied.error && <p role="alert" className="text-xs text-destructive-strong">{replied.error}</p>}

                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {canResend && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || resend.busy}
                      onClick={() => void resend.run(r.id).then((u) => u && toast[u.emailStatus === "sent" ? "success" : "error"](u.emailStatus === "sent" ? "Email sent to the client" : "The email failed again"))}
                    >
                      <RefreshCw className="h-4 w-4" /> Resend email
                    </Button>
                  )}
                  {canMarkReplied && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || replied.busy}
                      onClick={() => void replied.run(r.id).then((u) => u && toast.success(`${u.number} marked as client replied`))}
                    >
                      <MailCheck className="h-4 w-4" /> Client replied
                    </Button>
                  )}
                  {canOverrideSend && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setOverrideOpen(true)}>
                      <Send className="h-4 w-4" /> Override: send
                    </Button>
                  )}
                  {canSend && (
                    <Button size="sm" disabled={busy} onClick={() => void act(() => RequestRepository.send(r.id), `${r.number} sent`)}>
                      <Send className="h-4 w-4" /> Countersign &amp; send
                    </Button>
                  )}
                  {mineToAnswer && r.status === "open" && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(() => RequestRepository.acknowledge(r.id), "Marked in review")}>
                      Start review
                    </Button>
                  )}
                  {mineToAnswer && (
                    <Button size="sm" disabled={busy} onClick={() => setResponding(true)}>
                      <CheckCircle2 className="h-4 w-4" /> {isClient ? "Mark answered" : "Respond"}
                    </Button>
                  )}
                  {canFollowUp && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setFollowingUp(true)}>
                      <CornerDownRight className="h-4 w-4" /> Follow up
                    </Button>
                  )}
                  {canChangeOrder && (
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setChangeOrder(true)}>
                      <FilePlus2 className="h-4 w-4" /> Raise change order
                    </Button>
                  )}
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/requests/${r.id}/print`} target="_blank" rel="noreferrer">
                      <Printer className="h-4 w-4" /> Print / PDF
                    </Link>
                  </Button>
                  {canClose && (
                    <Button size="sm" variant="destructive" className="shadow-sm" disabled={busy} onClick={() => setClosing(true)}>
                      <XCircle className="h-4 w-4" /> Close
                    </Button>
                  )}
                </div>

                {handlesClient && clientActive && (
                  <p className="text-xs text-muted-foreground">Replies go to your Gmail. Update the status here once you've handled it.</p>
                )}

                {canRecordReturned && !r.returnedByName && <ReturnedForm requestId={r.id} onDone={done} />}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {r && (
        <>
          <RespondDialog request={r} open={responding} onOpenChange={setResponding} onDone={done} />
          <FollowUpDialog request={r} open={followingUp} onOpenChange={setFollowingUp} onDone={done} />
          <ConfirmDialog
            open={closing}
            onOpenChange={setClosing}
            title={`Close ${r.number}?`}
            description="A closed request no longer counts as open and cannot be answered. Raise a new request if the question comes back."
            confirmLabel="Close request"
            loading={busy}
            onConfirm={() => {
              setClosing(false);
              void act(() => RequestRepository.close(r.id), `${r.number} closed`);
            }}
          />
          {canChangeOrder && (
            <NewWorkflowDialog
              open={changeOrder}
              onOpenChange={setChangeOrder}
              templates={templates.templates}
              creating={templates.creating}
              error={templates.error}
              onSubmit={async (input) => {
                const created = await templates.createWorkflow(input);
                if (created) toast.success("Change Order Request started");
                return created;
              }}
              presetTemplateName="Change Order Request"
              presetProjectCode={r.projectCode}
              presetTitle={`Change order — ${r.number}: ${r.subject}`.slice(0, 255)}
              presetAmount={undefined}
            />
          )}
        </>
      )}
    </>
  );
}

function ReturnedForm({ requestId, onDone }: { requestId: number; onDone: () => void }) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = name.trim().length >= 2 && position.trim().length >= 2;
  return (
    <section aria-label="Record returned document" className="space-y-2 rounded-xl border border-dashed p-3">
      <h4 className="text-xs font-medium text-muted-foreground">Returned document — received by contractor staff</h4>
      <div className="grid grid-cols-2 gap-2">
        <Input aria-label="Name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input aria-label="Position" placeholder="Position" value={position} onChange={(e) => setPosition(e.target.value)} />
      </div>
      <Button
        size="sm"
        variant="outline"
       
        disabled={!ok || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await RequestRepository.recordReturned(requestId, { returnedByName: name.trim(), returnedByPosition: position.trim() });
            toast.success("Returned document recorded");
            onDone();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not record it");
          } finally {
            setBusy(false);
          }
        }}
      >
        Record
      </Button>
    </section>
  );
}

function FollowUpDialog({
  request,
  open,
  onOpenChange,
  onDone,
}: {
  request: DesignRequestDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Follow up on {request.number}</DialogTitle>
          <DialogDescription>Creates a new request to {request.recipientType === "client" ? request.recipientEmail : request.assignedToName}, linked to this one.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="fu-text">What still needs clarifying</Label>
          <Textarea id="fu-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
          <RequestFilePicker files={files} onChange={setFiles} disabled={busy} />
          {error && <p role="alert" className="text-xs text-destructive-strong">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
           
            disabled={busy || text.trim().length < 10}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const uploaded = files.length ? await uploadAll(files) : [];
                const created = await RequestRepository.followUp(request.id, { requestText: text.trim(), files: uploaded });
                toast.success(`${created.number} sent`);
                setText("");
                setFiles([]);
                onDone();
                onOpenChange(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not create the follow-up");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Send className="h-4 w-4" /> Send follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
