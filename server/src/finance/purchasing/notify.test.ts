import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test";

describe("claimLink", async () => {
  const { claimLink } = await import("./notify.js");
  test("Engineer and Site Personnel go to My claims", () => {
    assert.equal(claimLink("engineer"), "/my-claims");
    assert.equal(claimLink("site-personnel"), "/my-claims");
  });
  test("a claimant who can no longer open My claims is sent to the dashboard", () => {
    for (const role of ["project-manager", "architect", "human-resources", null, undefined]) {
      assert.equal(claimLink(role), "/dashboard");
    }
  });
});
