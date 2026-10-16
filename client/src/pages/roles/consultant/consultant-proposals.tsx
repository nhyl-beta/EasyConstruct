import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useCallback, useEffect, useState } from "react";

import {
  FileText,
} from "lucide-react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SplitDetailLayout, selectedRowClass } from "@/components/detail-panel/DetailPanel";
import { useSelectedParam } from "@/hooks/use-selected-param";
import { ProposalDetailPanel } from "@/features/proposals/ProposalDetailPanel";
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
import { isStaleValidation } from "@/features/proposals/lib/validation-format";

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

  // The open proposal lives in the URL (?selected=<id>) so it can be deep-linked; deriving it from
  // the loaded list keeps the panel in step with a refresh after a decision.
  const [selectedId, selectParam] = useSelectedParam();
  const selectedProposal: Proposal | null = proposals.find((p) => String(p.id) === selectedId) ?? null;
  const [order, setOrder] = useState<number[]>([]);

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

  // A different proposal opened: start from its saved comment, with no stale error.
  useEffect(() => {
    setComment(selectedProposal?.reviewComment ?? "");
    setActionError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProposal?.id]);

  const stepSelection = useCallback(
    (delta: 1 | -1) => {
      if (order.length === 0) return;
      const at = order.findIndex((id) => String(id) === selectedId);
      const next = order[Math.min(order.length - 1, Math.max(0, at + delta))];
      if (next !== undefined) selectParam(next);
    },
    [order, selectedId, selectParam],
  );

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
    setOrder(pendingProposals.map((p) => p.id));
  }, [pendingProposals]);

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

    selectParam(proposal.id);
    setActionNotice(null);
  };

  /*
   * ----------------------------------------------------------
   * CLOSE PROPOSAL
   * ----------------------------------------------------------
   */

  const closeProposal = useCallback(() => {
    selectParam(null);
    setComment("");
    setActionError(null);
  }, [selectParam]);

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
    selectParam(null);
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

  // Sticky footer of the detail panel: the required comment and the three decisions.
  const reviewActions = selectedProposal && (
    <div className="w-full space-y-2">
      <label htmlFor="consultant-review-comment" className="block text-sm font-medium">
        Review comment <span className="text-destructive-strong">*</span>
      </label>
      <Textarea
        id="consultant-review-comment"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Please revise the structural details before final approval."
        className="min-h-20"
      />
      <p className="text-xs text-muted-foreground">Required. The decision buttons unlock once this is filled in.</p>
      {actionError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive-strong">
          {actionError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {PROPOSAL_DECISIONS.map((decision) => {
          const Icon = decision.icon;
          return (
            <Button
              key={decision.status}
              type="button"
              size="sm"
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
      {reviewing && <p className="text-sm text-muted-foreground">Submitting consultant review...</p>}
    </div>
  );

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
        <SplitDetailLayout
          open={!!selectedProposal}
          onClose={closeProposal}
          onStep={stepSelection}
          sheetLabel="Proposal review"
          panel={({ inSheet }) =>
            selectedProposal && (
              <ProposalDetailPanel
                proposal={selectedProposal}
                siblings={pendingProposals}
                onSelectRelated={openProposal}
                onClose={closeProposal}
                inSheet={inSheet}
                actions={reviewActions}
                contentExtra={<ProposalAttachments proposal={selectedProposal} />}
                validationEmptyText={validationFailed ? "The validation summary could not be generated right now." : "Preparing the validation summary…"}
                onRerunValidation={() =>
                  setValidationTried((prev) => {
                    const next = new Set(prev);
                    next.delete(selectedProposal.id);
                    return next;
                  })
                }
              />
            )
          }
        >

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
                        aria-selected={selectedProposal?.id === proposal.id}
                        onClick={() => openProposal(proposal)}
                        className={`cursor-pointer border-b last:border-b-0 hover:bg-muted/20 ${selectedProposal?.id === proposal.id ? selectedRowClass : ""}`}
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
        </SplitDetailLayout>

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