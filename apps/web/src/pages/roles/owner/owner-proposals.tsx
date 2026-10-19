import { ProposalsRegister } from "@/features/proposals/components/ProposalsRegister";

// Owner had no view of the proposal register at all — this is new, not a
// re-styling. Read-only by construction: the executive sees what has been
// submitted and how it was decided, but reviewing is the Consultant's job.
//
// The register sorts ascending on Proposal ID and shows which column the
// order belongs to; see ProposalsTable for why the previous implicit
// submission order did not read as ascending.
export default function OwnerProposals() {
  return (
    <ProposalsRegister
      title="Proposals"
      description="Every design proposal submitted across the organization, in ascending order."
    />
  );
}

OwnerProposals.displayName = "OwnerProposals";
