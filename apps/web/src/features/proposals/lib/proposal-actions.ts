import type { Proposal } from "../types/proposal.types";

// B-158/B-160: which row actions a proposal shows on the Architect's Proposals
// page. Pulled out as pure predicates so the visibility rules (not the dialog/
// button markup) can be unit tested without rendering the page.

/** Title/project/amount/content are still open to edit: never reviewed, or
 * sent back for revision (where editing is exactly what the architect needs). */
export const canEditProposal = (proposal: Pick<Proposal, "reviewedAt" | "reviewComment" | "status">): boolean =>
  (!proposal.reviewedAt && !proposal.reviewComment) || proposal.status === "Revision Requested";

/** Rejected/Approved are terminal — the attached file shouldn't change once
 * the review is final. Anything still active (Pending, Revision Requested, …)
 * can still have its file replaced. */
export const canAttachFile = (proposal: Pick<Proposal, "workflowId" | "status">): boolean =>
  proposal.workflowId != null && proposal.status !== "Rejected" && proposal.status !== "Approved";

/** Only a proposal the consultant sent back has anything to resubmit. */
export const canRespond = (proposal: Pick<Proposal, "status">): boolean =>
  proposal.status === "Revision Requested";
