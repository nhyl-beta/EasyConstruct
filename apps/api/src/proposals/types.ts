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

export interface ProposalRecord {
  id: number;

  proposalId: string;

  title: string;

  projectCode: string;

  submittedBy: string;

  status: string;

  amount: string | null;

  content: string | null;

  aiValidation: string | null;

  assignedReviewer: string | null;

  reviewerName: string | null;

  reviewComment: string | null;

  reviewedAt: Date | null;

  createdAt: Date | null;

  updatedAt: Date | null;
}

export interface CreateProposalInput {
  proposalId: string;

  title: string;

  projectCode: string;

  submittedBy: string;

  status?: string;

  amount?: string;

  content?: string;

  aiValidation?: string;

  assignedReviewer?: ProposalReviewer;
}

export interface UpdateProposalInput {
  title?: string;

  projectCode?: string;

  submittedBy?: string;

  status?: string;

  amount?: string;

  content?: string;

  aiValidation?: string;

  assignedReviewer?: ProposalReviewer;

  reviewerName?: string;

  reviewComment?: string;

  reviewedAt?: Date;
}

export interface ProposalReviewInput {
  status:
    | "Approved"
    | "Revision Requested"
    | "Rejected";

  reviewerName?: string;

  reviewComment?: string;
}

export interface ProposalFilters {
  status?: string;

  projectCode?: string;

  search?: string;
}