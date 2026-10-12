import { DecisionSupportLabel } from "@/components/shared/decision-support-label";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useEffect, useState } from "react";

import {
  ArrowLeft,
  FileText,
} from "lucide-react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApprovalQueuePanel } from "@/components/workflows/approval-queue-panel";
import {
  PROPOSAL_DECISIONS,
  findProposalDecision,
} from "@/features/proposals/lib/proposal-decisions";
import { useProposals } from "@/features/proposals/hooks/useProposals";
import { useAuth } from "@/auth/auth-context";
import { ProposalAttachments } from "@/pages/roles/consultant/proposal-attachments";
import { WorkflowRepository } from "@/features/workflows/repositories/workflow.repository";
import type { Proposal } from "@/features/proposals/types/proposal.types";
import { FEATURES } from "@/config/features";
import { ProposalValidationPanel, isStaleValidation } from "@/features/proposals/components/ProposalValidationPanel";

/*
 * ============================================================
 * REVIEW STATUS
 * ============================================================
 */

type ReviewStatus =
  | "Approved"
  | "Revision Requested"
  | "Rejected";

/*
 * ============================================================
 * CONSULTANT PROPOSALS PAGE
 * ============================================================
 */

export default function ConsultantProposalsPage() {
  /*
   * ----------------------------------------------------------
   * DATA
   * ----------------------------------------------------------
   *
   * Goes through the proposals feature hook rather than calling apiClient
   * from the page. The page previously read `result?.data` itself, which
   * duplicated the { success, message, data } unwrapping the feature layer
   * already does and meant this screen and the rest of the app could
   * disagree about the shape of a proposal.
   */

  const { user } = useAuth();

  const {
    proposals,
    loading,
    saving: reviewing,
    error: loadError,
    refresh: loadProposals,
    reviewProposal: submitReview,
    validateProposal,
    pagination,
  } = useProposals({ queue: "consultant" });

  // J: a proposal created while the AI flag was off has no stored validation
  // summary. Ask the server to compute it once per proposal, then reload so the
  // open review screen picks it up.
  const [validationTried, setValidationTried] = useState<Set<number>>(new Set());
  const [validationFailed, setValidationFailed] = useState(false);

  const [selectedProposal, setSelectedProposal] =
    useState<Proposal | null>(null);

  const [comment, setComment] =
    useState("");

  const [actionError, setActionError] =
    useState<string | null>(null);

  const [actionNotice, setActionNotice] =
    useState<string | null>(null);

  // Approve / Request Revision / Reject are irreversible once submitted —
  // the proposal's status and reviewer are overwritten with no undo — so the
  // decision is confirmed first. Same guard as IT Designer's review screen.
  const [pendingDecision, setPendingDecision] =
    useState<ReviewStatus | null>(null);

  // Whichever of the two tabs actually has something waiting on the
  // Consultant is shown first, instead of always defaulting to Design
  // Proposals — a full workflow-approvals queue was easy to miss behind an
  // empty proposals tab. Only decided once, from the first load of both
  // sources, so it doesn't yank the tab out from under someone mid-review.
  const [activeTab, setActiveTab] = useState<"proposals" | "approvals">("proposals");
  const [autoTabPicked, setAutoTabPicked] = useState(false);
  const [approvalsPending, setApprovalsPending] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    WorkflowRepository.getApprovalStats()
      .then((stats) => {
        if (!cancelled) setApprovalsPending(stats.pending);
      })
      .catch(() => {
        if (!cancelled) setApprovalsPending(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!FEATURES.ai || !selectedProposal) return;
    // Missing, or made by an older set of checks: compute it again (the server keeps a current one as it is).
    if (selectedProposal.aiValidation && !isStaleValidation(selectedProposal.aiValidation)) return;
    const id = selectedProposal.id;
    if (validationTried.has(id)) return;
    setValidationTried((prev) => new Set(prev).add(id));
    setValidationFailed(false);
    validateProposal(id)
      .then(() => loadProposals())
      .catch(() => setValidationFailed(true));
  }, [selectedProposal, validationTried, validateProposal, loadProposals]);

  /*
   * Keep the open review screen in step with a refreshed list, so the
   * decision that was just submitted is reflected without closing and
   * reopening the proposal.
   */
  useEffect(() => {
    if (!selectedProposal) return;
    const fresh = proposals.find((p) => p.id === selectedProposal.id);
    if (fresh && fresh !== selectedProposal) setSelectedProposal(fresh);
  }, [proposals, selectedProposal]);

  /*
   * ----------------------------------------------------------
   * FILTER CONSULTANT PROPOSALS
   * ----------------------------------------------------------
   *
   * A proposal appears if:
   *
   * 1. It is Pending
   * 2. It is assigned to Consultant
   *
   * OR
   *
   * 3. It is an older Architect proposal that does not
   *    have assignedReviewer yet.
   *
   */

  // The review queue (Pending, assigned to the consultant or to nobody yet) is
  // selected on the server: see proposals/repository.ts reviewQueue.
  const pendingProposals = proposals;

  useEffect(() => {
    if (autoTabPicked || loading || approvalsPending === null) return;
    if (pendingProposals.length === 0 && approvalsPending > 0) {
      setActiveTab("approvals");
    }
    setAutoTabPicked(true);
  }, [autoTabPicked, loading, approvalsPending, pendingProposals.length]);

  /*
   * ----------------------------------------------------------
   * OPEN PROPOSAL
   * ----------------------------------------------------------
   */

  const openProposal = (
    proposal: Proposal,
  ) => {
    /*
     * This is the important state change.
     *
     * Once this is not null, the page below will render
     * the review screen.
     */

    setSelectedProposal(proposal);

    setActionError(null);
    setActionNotice(null);

    /*
     * Load an existing comment if there is one.
     */

    setComment(
      proposal.reviewComment ?? "",
    );
  };

  /*
   * ----------------------------------------------------------
   * CLOSE PROPOSAL
   * ----------------------------------------------------------
   */

  const closeProposal = () => {
    setSelectedProposal(null);

    setComment("");

    setActionError(null);
  };

  /*
   * ----------------------------------------------------------
   * REVIEW PROPOSAL
   * ----------------------------------------------------------
   */

  const reviewProposal = async (
    proposal: Proposal,
    status: ReviewStatus,
  ) => {
    setActionError(null);
    setActionNotice(null);

    /*
     * Require a comment. Surfaced inline rather than through alert(), which
     * is suppressed by some browsers and invisible in automated runs.
     */

    if (!comment.trim()) {
      setActionError(
        "Please enter a review comment before submitting your decision.",
      );

      return;
    }

    const updated = await submitReview(proposal.id, {
      status,

      // The person who actually decided, not the literal string
      // "Consultant" — the review is attributed in the proposals register
      // and every decision used to be signed with the role name.
      reviewerName:
        user?.name ?? "Consultant",

      reviewComment:
        comment.trim(),
    });

    if (!updated) {
      // useProposals already captured the server's message in `error`;
      // repeat it here so it appears next to the buttons that were clicked.
      setActionError(
        loadError ?? "Failed to submit the proposal review.",
      );
      return;
    }

    setComment("");
    setSelectedProposal(null);
    setActionNotice(
      `${updated.proposalId} — ${status.toLowerCase()}.`,
    );
  };

  /*
   * ==========================================================
   * DECISION CONFIRMATION
   * ==========================================================
   *
   * THE BUG THIS FIXES: this dialog used to be rendered only inside the
   * proposal-LIST return. The review screen returns early, above that JSX,
   * so once a proposal was open the dialog was not mounted at all — clicking
   * Approve / Request Revision / Reject set `pendingDecision` and then
   * nothing happened, because the only thing that reads `pendingDecision`
   * and calls reviewProposal() was not on the page.
   *
   * It is now built once and rendered in BOTH returns, so the decision
   * buttons work from whichever screen the consultant is on.
   */

  const decisionConfirmDialog = (
    <ConfirmDialog
      open={pendingDecision !== null}
      onOpenChange={(open) => !open && setPendingDecision(null)}
      title={
        pendingDecision
          ? findProposalDecision(pendingDecision)?.confirmTitle ?? "Submit review?"
          : ""
      }
      description={
        pendingDecision
          ? findProposalDecision(pendingDecision)?.confirmDescription
          : undefined
      }
      confirmLabel={
        pendingDecision
          ? findProposalDecision(pendingDecision)?.label ?? "Confirm"
          : "Confirm"
      }
      destructive={
        pendingDecision
          ? findProposalDecision(pendingDecision)?.destructive ?? false
          : false
      }
      loading={reviewing}
      onConfirm={() => {
        if (!selectedProposal || !pendingDecision) return;
        const decision = pendingDecision;
        setPendingDecision(null);
        void reviewProposal(selectedProposal, decision);
      }}
    />
  );

  /*
   * ==========================================================
   * REVIEW SCREEN
   * ==========================================================
   *
   * If selectedProposal exists, the proposal list disappears
   * and the Consultant Review interface appears.
   */

  if (selectedProposal) {
    return (
      <PageContainer>

        <PageHeader
          title="Proposal Review"
          description="Review the proposal and submit your professional assessment."
        />

        <PageContent className="p-6 md:p-8">

          <div className="mx-auto max-w-4xl space-y-6">

            {/* ------------------------------------------------
                BACK BUTTON
                ------------------------------------------------ */}

            <Button
              type="button"
              variant="ghost"
              onClick={closeProposal}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />

              Back to Proposals
            </Button>

            {/* ------------------------------------------------
                PROPOSAL INFORMATION
                ------------------------------------------------ */}

            <div className="rounded-xl border bg-card">

              <div className="border-b p-6">

                <div className="flex flex-wrap items-start justify-between gap-4">

                  <div>

                    <p className="font-mono text-xs text-muted-foreground">
                      {
                        selectedProposal.proposalId
                      }
                    </p>

                    <h1 className="mt-2 text-2xl font-bold">
                      {
                        selectedProposal.title
                      }
                    </h1>

                  </div>

                  <StatusBadge
                    status={
                      selectedProposal.status
                    }
                  />

                </div>

              </div>

              <div className="grid gap-6 p-6 sm:grid-cols-2">

                {/* Project */}

                <div>

                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Project
                  </p>

                  <p className="mt-1 font-medium">
                    {
                      selectedProposal.projectCode
                    }
                  </p>

                </div>

                {/* Submitted By */}

                <div>

                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Submitted By
                  </p>

                  <p className="mt-1 font-medium">
                    {
                      selectedProposal.submittedBy
                    }
                  </p>

                </div>

                {/* Amount */}

                <div>

                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Estimated Amount
                  </p>

                  <p className="mt-1 font-medium">
                    {
                      selectedProposal.amount ??
                      "Not provided"
                    }
                  </p>

                </div>

                {/* Reviewer */}

                <div>

                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Assigned Reviewer
                  </p>

                  <p className="mt-1 font-medium">
                    {
                      selectedProposal.assignedReviewer ??
                      "Consultant"
                    }
                  </p>

                </div>

              </div>

            </div>

            {/* ------------------------------------------------
                PROPOSAL DESCRIPTION
                ------------------------------------------------ */}

            <div className="rounded-xl border bg-card">

              <div className="border-b p-6">

                <h2 className="font-semibold">
                  Proposal Details
                </h2>

              </div>

              <div className="p-6">

                {selectedProposal.content ? (
                  <p className="whitespace-pre-wrap text-sm leading-7">
                    {
                      selectedProposal.content
                    }
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No proposal description was
                    provided.
                  </p>
                )}

              </div>

            </div>

            {/* ------------------------------------------------
                ATTACHED FILES
                ------------------------------------------------
                The submission's files were not shown anywhere on this
                screen, so "review the proposal" meant reviewing its title
                and a paragraph of text. Proposals have no file column of
                their own, so the files are the documents filed against the
                proposal's project — see ProposalAttachments. */}

            <ProposalAttachments proposal={selectedProposal} />

            {/* ------------------------------------------------
                RULE-BASED VALIDATION
                ------------------------------------------------ */}

            {FEATURES.ai && (
              <div className="rounded-xl border bg-card">

                <div className="border-b p-6">

                  <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                    Rule-based validation summary
                    <DecisionSupportLabel />
                  </h2>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Completeness checks — decision support only.
                  </p>

                </div>

                <div className="p-6">
                  <ProposalValidationPanel
                    raw={selectedProposal.aiValidation}
                    emptyText={
                      validationFailed
                        ? "The validation summary could not be generated right now."
                        : "Preparing the validation summary…"
                    }
                    onRerun={() => {
                      setValidationTried((prev) => {
                        const next = new Set(prev);
                        next.delete(selectedProposal.id);
                        return next;
                      });
                    }}
                  />
                </div>

              </div>
            )}

            {/* ------------------------------------------------
                CONSULTANT REVIEW
                ------------------------------------------------ */}

            <div className="rounded-xl border bg-card">

              <div className="border-b p-6">

                <h2 className="font-semibold">
                  Consultant Review
                </h2>

                <p className="mt-1 text-sm text-muted-foreground">
                  Provide your professional assessment
                  before making a decision.
                </p>

              </div>

              <div className="space-y-6 p-6">

                {/* Comment */}

                <div>

                  <label
                    htmlFor="consultant-review-comment"
                    className="mb-2 block text-sm font-medium"
                  >
                    Review Comment <span className="text-destructive-strong">*</span>
                  </label>

                  <Textarea
                    id="consultant-review-comment"
                    value={comment}
                    onChange={(event) =>
                      setComment(
                        event.target.value,
                      )
                    }
                    placeholder="Please revise the structural details before final approval."
                    className="min-h-40"
                  />

                  <p className="mt-2 text-xs text-muted-foreground">
                    Required — explain what should be approved,
                    revised, or rejected. The decision buttons below
                    unlock once this is filled in.
                  </p>

                </div>

                {/* Decision Buttons */}

                {/* Q2: these used to stay clickable with an empty comment,
                    so a Consultant could click Approve, confirm in the
                    dialog, and only then see an error telling them a
                    comment was required all along — reading as "nothing
                    happens when I click approve". Disabling them up front,
                    with the label above explaining why, catches this
                    before the confirm round-trip instead of after. */}
                {actionError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive-strong"
                  >
                    {actionError}
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  {PROPOSAL_DECISIONS.map((decision) => {
                    const Icon = decision.icon;
                    return (
                      <Button
                        key={decision.status}
                        type="button"
                        variant={decision.variant}
                        disabled={reviewing || !comment.trim()}
                        title={!comment.trim() ? "Enter a review comment first" : undefined}
                        onClick={() => setPendingDecision(decision.status)}
                        className="gap-2"
                      >
                        <Icon className="h-4 w-4" />
                        {decision.label}
                      </Button>
                    );
                  })}
                </div>

                {/* Loading */}

                {reviewing && (
                  <p className="text-sm text-muted-foreground">
                    Submitting consultant review...
                  </p>
                )}

              </div>

            </div>

          </div>

        </PageContent>

        {decisionConfirmDialog}

      </PageContainer>
    );
  }

  /*
   * ==========================================================
   * PROPOSAL LIST SCREEN
   * ==========================================================
   */

  return (
    <PageContainer>

      <PageHeader
        title="Proposal Review"
        description="Review design proposals submitted by Architects, and decide on any workflow stage waiting on Consultant Review — one screen for both."
      />

      <PageContent className="p-6 md:p-8">

        {/* Consultant used to have a second, separate "Approvals" screen for
            deciding on workflow stages (Consultant Review on a Design
            Proposal Approval chain, etc.) — same decisions, different page
            from the one that reviews the proposal itself. Folded in here as
            a tab so there is one "Proposal Review" screen that carries both,
            per role-tab.ts/role-resources.ts no longer routing Consultant to
            a standalone /approvals nav item. */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "proposals" | "approvals")} className="mb-6">
          <TabsList className="h-10">
            <TabsTrigger value="proposals">
              Design proposals
            </TabsTrigger>
            <TabsTrigger value="approvals">
              Workflow approvals
            </TabsTrigger>
          </TabsList>

          <TabsContent value="approvals" className="pt-4">
            {/* Was false: at the time, WORKFLOW_ACTIONS_BY_ROLE had no
                Consultant entry, so this rendered nothing either way. Now
                that Document Compliance Review gives Consultant an action,
                and consultant-proposals.tsx is this role's only reachable
                workflow-approvals screen (role-resources.ts deliberately
                keeps Consultant off the generic /approvals route), this is
                the only place that action could ever be shown. */}
            <ApprovalQueuePanel
              emptyPendingMessage="Nothing pending your decision."
              showInitiationActions
            />
          </TabsContent>

          <TabsContent value="proposals" className="space-y-0 pt-4">

        {/* ----------------------------------------------------
            PAGE INFORMATION
            ---------------------------------------------------- */}

        <div className="mb-6">

          <h2 className="text-lg font-semibold">
            Proposals Awaiting Review
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Select a proposal to review its details
            and provide your decision.
          </p>

        </div>

        {actionNotice && (
          <p className="mb-4 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success-strong">
            Review submitted — {actionNotice}
          </p>
        )}

        {loadError && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive-strong"
          >
            {loadError}
          </p>
        )}

        {/* ----------------------------------------------------
            LOADING
            ---------------------------------------------------- */}

        {loading ? (
          <div className="rounded-xl border p-12 text-center">

            <p className="text-sm text-muted-foreground">
              Loading proposals...
            </p>

          </div>
        ) : pendingProposals.length === 0 ? (
          /* --------------------------------------------------
             EMPTY
             -------------------------------------------------- */

          <div className="rounded-xl border border-dashed p-12 text-center">

            <FileText className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />

            <h2 className="text-lg font-semibold">
              No proposals awaiting review
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Architect proposals assigned to the
              Consultant will appear here.
            </p>

          </div>
        ) : (
          /* --------------------------------------------------
             PROPOSAL TABLE
             -------------------------------------------------- */

          <div className="overflow-hidden rounded-xl border">

            <div className="overflow-x-auto">

              <table className="w-full">

                <thead className="border-b bg-muted/20">

                  <tr>

                    <th className="px-4 py-4 text-left text-sm font-semibold">
                      ID
                    </th>

                    <th className="px-4 py-4 text-left text-sm font-semibold">
                      Title
                    </th>

                    <th className="px-4 py-4 text-left text-sm font-semibold">
                      Project
                    </th>

                    <th className="px-4 py-4 text-left text-sm font-semibold">
                      Submitted By
                    </th>

                    <th className="px-4 py-4 text-right text-sm font-semibold">
                      Amount
                    </th>

                    <th className="px-4 py-4 text-left text-sm font-semibold">
                      Status
                    </th>

                    <th className="px-4 py-4 text-left text-sm font-semibold">
                      Action
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {pendingProposals.map(
                    (proposal) => (
                      <tr
                        key={proposal.id}
                        className="border-b last:border-b-0 hover:bg-muted/20"
                      >

                        {/* ID */}

                        <td className="px-4 py-4">

                          <span className="font-mono text-xs">
                            {
                              proposal.proposalId
                            }
                          </span>

                        </td>

                        {/* TITLE */}

                        <td className="px-4 py-4">

                          <button
                            type="button"
                            onClick={() => openProposal(proposal)}
                            className="cursor-pointer text-left font-semibold text-primary-strong underline-offset-4 hover:underline"
                          >
                            {
                              proposal.title
                            }
                          </button>

                        </td>

                        {/* PROJECT */}

                        <td className="px-4 py-4 text-sm">
                          {
                            proposal.projectCode
                          }
                        </td>

                        {/* SUBMITTED BY */}

                        <td className="px-4 py-4 text-sm">
                          {
                            proposal.submittedBy
                          }
                        </td>

                        {/* AMOUNT */}

                        <td className="px-4 py-4 text-right text-sm">
                          {
                            proposal.amount ??
                            "—"
                          }
                        </td>

                        {/* STATUS */}

                        <td className="px-4 py-4">

                          <StatusBadge
                            status={
                              proposal.status
                            }
                          />

                        </td>

                        {/* ACTION */}

                        <td className="px-4 py-4">

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openProposal(proposal)}
                          >
                            Review →
                          </Button>

                        </td>

                      </tr>
                    ),
                  )}

                </tbody>

              </table>

            </div>

            <div className="border-t border-border px-4 py-3">
              <DataTablePagination {...pagination} />
            </div>

          </div>
        )}

          </TabsContent>
        </Tabs>

      </PageContent>

      {decisionConfirmDialog}

    </PageContainer>
  );
}

/*
 * ============================================================
 * DISPLAY NAME
 * ============================================================
 */

ConsultantProposalsPage.displayName =
  "ConsultantProposalsPage";