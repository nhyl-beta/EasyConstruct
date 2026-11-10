import { describe, expect, it } from "vitest";
import { canFollowUpRequest } from "./follow-up-rule";

describe("canFollowUpRequest (B-209)", () => {
  it.each(["project-manager", "engineer", "admin"])("%s sees Follow up on a sent request", (role) => {
    expect(canFollowUpRequest(role, "sent")).toBe(true);
  });

  it.each(["architect", "consultant", "finance-manager", "site-personnel"])("%s does not", (role) => {
    expect(canFollowUpRequest(role, "sent")).toBe(false);
  });

  it("is hidden on a draft or a closed request, for everyone", () => {
    expect(canFollowUpRequest("project-manager", "draft")).toBe(false);
    expect(canFollowUpRequest("admin", "closed")).toBe(false);
  });
});
