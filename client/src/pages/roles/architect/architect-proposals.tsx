import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useRef, useState } from "react";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";

import {
  Clock,
  FileText,
  Plus,
  Send,
} from "lucide-react";

import { PageHeader } from "@/components/refine-ui/views/page-header";

import { KpiStrip } from "@/components/ui/kpi-strip";

import { StatusBadge } from "@/components/ui/status-badge";

import { Input } from "@/components/ui/input";

import { Textarea } from "@/components/ui/textarea";

import { Button } from "@/components/ui/button";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useProposals } from "@/features/proposals/hooks/useProposals";
import { useDesignProposalSubmission } from "@/features/proposals/hooks/useDesignProposalSubmission";
import { WorkflowInitiationActions } from "@/components/workflows/workflow-initiation-actions";
import { useAuth } from "@/auth/auth-context";
import { ProjectPicker } from "@/components/shared/project-picker";
import { AlertTriangle, Archive, CheckCircle2, Paperclip, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { Proposal } from "@/features/proposals/types/proposal.types";
import type { UpdateProposalInput } from "@/features/proposals/controllers/proposal.controller";
import { FEATURES } from "@/config/features";

interface ValidationResult {
  passed: boolean;
  issues: string[];
  warnings: string[];
  /** What the checks compared the proposal with (fix 3.3); absent on older results. */
  basis?: string[];
}

function parseValidation(raw: string | null): ValidationResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ValidationResult;
  } catch {
    return null;
  }
}

function ValidationSummary({ raw }: { raw: string | null }) {
  const result = parseValidation(raw);
  if (!result) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="space-y-1 text-xs" title={result.basis?.join(" ")}>
      <div className={`flex items-center gap-1 font-medium ${result.passed ? "text-success-strong" : "text-destructive-strong"}`}>
        {result.passed ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        Rule-based validation — human review required
      </div>
      {result.issues.map((i) => (
        <div key={i} className="text-destructive-strong">
          • {i}
        </div>
      ))}
      {result.warnings.map((w) => (
        <div key={w} className="text-muted-foreground">
          • {w}
        </div>
      ))}
    </div>
  );
}

/** Attach (or re-attach) a file to an already submitted proposal's approval workflow. */
function AttachFileButton({ proposal, busy, onPick }: { proposal: Proposal; busy: boolean; onPick: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Choose a file for ${proposal.proposalId}`}
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) onPick(picked);
        }}
      />
      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} title="Attach a file" aria-label={`Attach a file to ${proposal.proposalId}`} onClick={() => inputRef.current?.click()}>
        <Paperclip className="h-3.5 w-3.5" />
      </Button>
    </>
  );
}

function EditProposalDialog({
  proposal,
  saving,
  onUpdate,
}: {
  proposal: Proposal;
  saving: boolean;
  onUpdate: (id: number, input: UpdateProposalInput) => Promise<Proposal | null>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const [projectCode, setProjectCode] = useState(proposal.projectCode);
  const [amount, setAmount] = useState(proposal.amount ?? "");
  const [content, setContent] = useState(proposal.content ?? "");

  const handleOpenChange = (next: boolean) => {
    if (next) {
      // Re-sync from the current row each time it's opened, in case a
      // background refresh updated the proposal since the last edit.
      setTitle(proposal.title);
      setProjectCode(proposal.projectCode);
      setAmount(proposal.amount ?? "");
      setContent(proposal.content ?? "");
    }
    setOpen(next);
  };

  const handleSubmit = async () => {
    const updated = await onUpdate(proposal.id, {
      title: title.trim(),
      projectCode,
      amount: amount.trim() || undefined,
      content: content.trim() || undefined,
    });
    if (updated) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title="Edit proposal">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit proposal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Project</Label>
            <ProjectPicker value={projectCode} onChange={setProjectCode} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <Label>Estimated amount</Label>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₱500,000" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-24" />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!title.trim() || !projectCode || saving} onClick={handleSubmit}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ArchitectProposals() {
  const c = useProposals({ hideArchived: true });
  const { user } = useAuth();

  // Submitting a proposal also opens its Design Proposal Approval workflow
  // (Architect Submission → Consultant Review → PM Approval). Composed in the
  // feature layer rather than here — see useDesignProposalSubmission.
  const designSubmission = useDesignProposalSubmission(c.submitProposal);

  const [showCreateForm, setShowCreateForm] =
    useState(false);
  useOpenOnAction("new-proposal", () => setShowCreateForm(true));

  const [submitNotice, setSubmitNotice] =
    useState<string | null>(null);

  const [title, setTitle] = useState("");

  const [projectCode, setProjectCode] =
    useState("");

  const [amount, setAmount] =
    useState("");

  const [content, setContent] =
    useState("");

  const [file, setFile] = useState<File | null>(null);

  const [formError, setFormError] =
    useState<string | null>(null);

  async function handleSubmit() {
    setFormError(null);
    setSubmitNotice(null);

    if (!title.trim()) {
      setFormError(
        "Please enter a proposal title.",
      );

      return;
    }

    if (!projectCode.trim()) {
      setFormError(
        "Please select the project this proposal is for.",
      );

      return;
    }

    const result = await designSubmission.submit({
      proposalId: `PROP-${Date.now()}`,

      title: title.trim(),

      projectCode: projectCode.trim(),

      // The architect who submitted it, not the literal role name — the
      // register and the consultant's review screen both show this.
      submittedBy: user?.name ?? "Architect",

      amount: amount.trim() || undefined,

      content: content.trim() || undefined,

      assignedReviewer: "consultant",
    }, file);

    if (!result) {
      return;
    }

    setSubmitNotice(
      (result.workflow
        ? `${result.proposal.proposalId} submitted — approval workflow ${result.workflow.code} started (${result.workflow.stages
            .map((stage) => stage.roleLabel)
            .join(" → ")}).`
        : `${result.proposal.proposalId} submitted.`) + (result.fileAttached ? "" : " The file was not attached; see below."),
    );

    setTitle("");
    setProjectCode("");
    setAmount("");
    setContent("");
    setFile(null);

    setShowCreateForm(false);
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader
        title="Proposals"
        description="Design proposals submitted against active projects."
      />

      <KpiStrip
        items={[
          {
            label: "Total proposals",
            value: `${c.kpis.total}`,
            icon: FileText,
          },
          {
            label: "Pending",
            value: `${c.kpis.pending}`,
            icon: Clock,
            tone: "warn",
          },
        ]}
      />

      {submitNotice && (
        <p className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success-strong">
          {submitNotice}
        </p>
      )}

      {/* The proposal saved but its workflow did not start — reported rather
          than rolled back, since discarding a saved proposal would be worse. */}
      {designSubmission.pendingUpload && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning-strong"
        >
          <span>
            {designSubmission.pendingUpload.proposalId} was saved, but the file "{designSubmission.pendingUpload.file.name}" was NOT attached:{" "}
            {designSubmission.pendingUpload.message} The Consultant will not see it until it is uploaded.
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={designSubmission.uploading} onClick={() => void designSubmission.retryUpload()}>
            {designSubmission.uploading ? "Uploading…" : "Retry upload"}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={designSubmission.dismissPendingUpload}>
            Dismiss
          </Button>
        </div>
      )}
      {designSubmission.uploadedNotice && (
        <p role="status" className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success-strong">
          {designSubmission.uploadedNotice}
        </p>
      )}

      <div className="flex items-center justify-between">
        {/* Public-works compliance is the architect's other initiation point —
            same shared workflow abstraction, different template. */}
        <WorkflowInitiationActions
          role={user?.role ?? ""}
          only={["Public works compliance"]}
        />

        <Button
          onClick={() =>
            setShowCreateForm(
              (current) => !current,
            )
          }
        >
          <Plus className="mr-2 h-4 w-4" />

          New Proposal
        </Button>
      </div>

      {showCreateForm && (
        <div className="rounded-2xl border p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold">
              Create Proposal
            </h2>

            <p className="text-sm text-muted-foreground">
              Submitting the proposal also opens its Design Proposal Approval
              workflow: Architect Submission → Consultant Review → PM Approval.
            </p>
          </div>

          {formError && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-strong">
              {formError}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium">
                Proposal Title
              </label>

              <Input
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                placeholder="Structural Design Proposal"
                className="mt-2"
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                Project
              </label>

              <ProjectPicker
                value={projectCode}
                onChange={setProjectCode}
                className="mt-2 w-full"
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                Estimated Amount
              </label>

              <Input
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value)
                }
                placeholder="₱500,000"
                className="mt-2"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium">
              Proposal Description
            </label>

            <Textarea
              value={content}
              onChange={(event) =>
                setContent(event.target.value)
              }
              placeholder="Describe the proposal, design considerations, materials, scope, and other relevant information."
              className="mt-2 min-h-32"
            />
          </div>

          <div className="mt-4">
            <label className="text-sm font-medium">
              Supporting file
            </label>

            <label className="mt-2 flex h-9 w-full max-w-sm cursor-pointer items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm hover:border-primary/40">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate text-muted-foreground">
                {file ? file.name : "Attach a design file (optional)"}
              </span>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.dwg,.dxf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="mt-6 flex gap-2">
            <Button
              disabled={designSubmission.submitting}
              onClick={handleSubmit}
            >
              <Send className="mr-2 h-4 w-4" />

              {designSubmission.submitting
                ? "Submitting..."
                : "Submit & start design approval"}
            </Button>

            <Button
              variant="ghost"
              disabled={designSubmission.submitting}
              onClick={() =>
                setShowCreateForm(false)
              }
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Fixed rem-based widths (w-24, w-48, w-56 x2, ...) summed to ~1300px
          regardless of viewport, which is what forced the horizontal
          scrollbar — table-fixed respects those literally instead of
          shrinking. Percentage widths keep the same relative proportions but
          always sum to 100% of the container, so text wraps (TableCell
          already breaks words by default) instead of overflowing. */}
      <div className="overflow-hidden rounded-2xl border">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[8%]">ID</TableHead>

              <TableHead className="w-[16%]">Title</TableHead>

              <TableHead className="w-[9%]">Project</TableHead>

              <TableHead className="w-[11%]">
                Submitted by
              </TableHead>

              <TableHead className="w-[8%] text-right">
                Amount
              </TableHead>

              <TableHead className="w-[10%]">Status</TableHead>

              {FEATURES.ai && <TableHead className="w-[16%]">Validation</TableHead>}

              <TableHead className={FEATURES.ai ? "w-[16%]" : "w-[32%]"}>Review</TableHead>

              <TableHead className="w-[6%]" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {c.loading ? (
              <TableRow>
                <TableCell
                  colSpan={FEATURES.ai ? 9 : 8}
                  className="h-24 text-center"
                >
                  Loading proposals...
                </TableCell>
              </TableRow>
            ) : c.proposals.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={FEATURES.ai ? 9 : 8}
                  className="h-24 text-center text-muted-foreground"
                >
                  No proposals found.
                </TableCell>
              </TableRow>
            ) : (
              c.proposals
                .map((proposal) => (
                <TableRow key={proposal.id}>
                  <TableCell className="font-mono text-xs">
                    {proposal.proposalId}
                  </TableCell>

                  <TableCell className="text-sm font-medium">
                    {proposal.title}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {proposal.projectCode}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    {proposal.submittedBy}
                  </TableCell>

                  <TableCell className="text-right text-sm">
                    {proposal.amount ?? "—"}
                  </TableCell>

                  <TableCell>
                    <StatusBadge
                      status={proposal.status}
                    />
                  </TableCell>

                  {FEATURES.ai && (
                    <TableCell>
                      <ValidationSummary raw={proposal.aiValidation} />
                    </TableCell>
                  )}

                  <TableCell className="text-sm">
                    {proposal.reviewComment ? (
                      <div>
                        <p className="line-clamp-2">
                          {proposal.reviewComment}
                        </p>

                        {proposal.reviewerName && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            By {proposal.reviewerName}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        —
                      </span>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!proposal.reviewedAt && !proposal.reviewComment && (
                        <EditProposalDialog
                          proposal={proposal}
                          saving={c.saving}
                          onUpdate={c.updateProposal}
                        />
                      )}
                      {proposal.workflowId != null && (
                        <AttachFileButton
                          proposal={proposal}
                          busy={designSubmission.uploading}
                          onPick={(picked) => void designSubmission.attachFile(proposal.proposalId, proposal.workflowId as number, picked)}
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={c.saving}
                        title="Archive"
                        onClick={() => c.archiveProposal(proposal.id)}
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3">
          <DataTablePagination {...c.pagination} />
        </div>
      </div>
    </div>
  );
}

ArchitectProposals.displayName =
  "ArchitectProposals";