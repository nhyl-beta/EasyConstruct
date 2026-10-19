import { ProposalsRegister } from "@/features/proposals/components/ProposalsRegister";

// IT Designer oversees the proposal register but does not decide on it.
//
// This screen previously carried the full Approve / Request Revision /
// Reject flow, on the reasoning that an administrator should be able to
// unblock a stalled submission. That put a second reviewer of record on a
// workflow that has exactly one — a proposal approved here would show IT
// Designer as the reviewer on the Architect's and Consultant's screens, with
// no consultant ever having read it. Reviewing is the Consultant's grant and
// is now enforced as such at the route (apps/api/src/proposals/routes.ts), so
// a decision taken here would be refused anyway.
//
// Read-only does not mean "less detail": ProposalsRegister opens the full
// submission — content, AI validation, reviewer, decision and timestamps.
export default function ITDesignerProposals() {
  return (
    <ProposalsRegister
      title="Proposals"
      description="System-wide, read-only oversight of the proposal register. Reviewing a proposal is the Consultant's decision."
    />
  );
}

ITDesignerProposals.displayName = "ITDesignerProposals";
