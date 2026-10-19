import { Check, PenLine, X, type LucideIcon } from "lucide-react";

/** The three terminal decisions POST /proposals/:id/review accepts. */
export type ProposalDecision =
  | "Approved"
  | "Revision Requested"
  | "Rejected";

export interface ProposalDecisionOption {
  status: ProposalDecision;
  label: string;
  icon: LucideIcon;
  variant: "default" | "outline" | "destructive";
  /** Shown in the confirmation dialog before the decision is submitted. */
  confirmTitle: string;
  confirmDescription: string;
  destructive: boolean;
}

// One definition shared by every screen that reviews a proposal (Consultant's
// review page and IT Designer's oversight review), so the three actions read
// and behave identically wherever they appear. A decision overwrites the
// proposal's status, reviewer and comment with no undo, which is why each one
// is confirmed first.
export const PROPOSAL_DECISIONS: ReadonlyArray<ProposalDecisionOption> = [
  {
    status: "Approved",
    label: "Approve",
    icon: Check,
    variant: "default",
    confirmTitle: "Approve this proposal?",
    confirmDescription:
      "The proposal is marked Approved and your comment is recorded against it. This can't be undone from this screen.",
    destructive: false,
  },
  {
    status: "Revision Requested",
    label: "Request Revision",
    icon: PenLine,
    variant: "outline",
    confirmTitle: "Send this proposal back for revision?",
    confirmDescription:
      "The architect is asked to revise and resubmit. Your comment is recorded as the reason.",
    destructive: false,
  },
  {
    status: "Rejected",
    label: "Reject",
    icon: X,
    variant: "destructive",
    confirmTitle: "Reject this proposal?",
    confirmDescription:
      "The proposal is closed as Rejected. This can't be undone from this screen.",
    destructive: true,
  },
];

export function findProposalDecision(status: ProposalDecision) {
  return PROPOSAL_DECISIONS.find((d) => d.status === status);
}
