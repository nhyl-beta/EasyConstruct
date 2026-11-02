import { ProposalsRegister } from "@/features/proposals/components/ProposalsRegister";

// Owner had no view of the proposal register at all — this is new, not a
// re-styling. Read-only by construction: the executive sees what has been
// submitted and how it was decided, but reviewing is the Consultant's job.
//
// The register is fixed in ascending Proposal ID order and the Owner's column
// headers have no sort buttons (the IT Designer's register keeps them); see
// ProposalsTable for why the previous implicit order did not read as ascending.
export default function OwnerProposals() {
  return (
    <ProposalsRegister
      title="Proposals"
      description="Every design proposal submitted across the organization, in ascending order."
      sortable={false}
    />
  );
}

OwnerProposals.displayName = "OwnerProposals";
