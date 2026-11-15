import { describe, expect, it } from "vitest";
import { canAttachFile, canEditProposal, canRespond } from "./proposal-actions";

describe("proposal row action visibility", () => {
  it("B-158: Attach is hidden once a proposal is Rejected or Approved", () => {
    expect(canAttachFile({ workflowId: 1, status: "Rejected" })).toBe(false);
    expect(canAttachFile({ workflowId: 1, status: "Approved" })).toBe(false);
    expect(canAttachFile({ workflowId: 1, status: "Pending" })).toBe(true);
    expect(canAttachFile({ workflowId: 1, status: "Revision Requested" })).toBe(true);
    expect(canAttachFile({ workflowId: null, status: "Pending" })).toBe(false);
  });

  it("B-160: Respond only appears for Revision Requested", () => {
    expect(canRespond({ status: "Revision Requested" })).toBe(true);
    expect(canRespond({ status: "Pending" })).toBe(false);
    expect(canRespond({ status: "Rejected" })).toBe(false);
  });

  it("Edit stays available after a revision request, not after a final decision", () => {
    expect(canEditProposal({ reviewedAt: null, reviewComment: null, status: "Pending" })).toBe(true);
    expect(
      canEditProposal({ reviewedAt: "2026-01-01", reviewComment: "Revise this", status: "Revision Requested" }),
    ).toBe(true);
    expect(canEditProposal({ reviewedAt: "2026-01-01", reviewComment: "Looks good", status: "Approved" })).toBe(false);
    expect(canEditProposal({ reviewedAt: "2026-01-01", reviewComment: "No", status: "Rejected" })).toBe(false);
  });
});
