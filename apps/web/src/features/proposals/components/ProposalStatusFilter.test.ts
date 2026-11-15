import { describe, expect, it } from "vitest";
import { PROPOSAL_STATUS_FILTERS } from "./ProposalStatusFilter";

describe("proposal status filter (B-40)", () => {
  it("offers All plus every status the review can set, using the server's own words", () => {
    expect(PROPOSAL_STATUS_FILTERS.map((s) => s.value)).toEqual(["all", "Pending", "Approved", "Revision Requested", "Rejected"]);
  });
});
