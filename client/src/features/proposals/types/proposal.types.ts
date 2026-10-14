export type ProposalStatus =
  | "Draft"
  | "Pending"
  | "In Review"
  | "Approved"
  | "Revision Requested"
  | "Rejected";

export type ProposalReviewer =
  | "consultant"
  | "engineer"
  | "finance_manager";

export interface Proposal {
  id: number;

  proposalId: string;

  /** The proposal's Design Proposal Approval workflow; files are attached to it. */
  workflowId?: number | null;

  title: string;

  projectCode: string;

  submittedBy: string;

  status: ProposalStatus | string;

  amount: string | null;

  content: string | null;

  aiValidation: string | null;

  assignedReviewer:
    | ProposalReviewer
    | string
    | null;

  reviewerName: string | null;

  reviewComment: string | null;

  reviewedAt: string | null;

  createdAt: string | null;

  updatedAt: string | null;
}