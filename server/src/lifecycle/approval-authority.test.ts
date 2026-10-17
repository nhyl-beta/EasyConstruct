import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { decideAuthority, isValidOverrideReason, overrideSummary } from "./approval-authority.js";

const ask = (over: Partial<Parameters<typeof decideAuthority>[0]>) =>
  decideAuthority({ role: "project-manager", isProjectPm: true, action: "approve this requirement", ...over });

describe("approval authority", () => {
  test("the project's own PM is allowed, with no override", () => {
    assert.deepEqual(ask({}), { override: false });
  });

  test("a PM who is not on the project is refused", () => {
    assert.throws(() => ask({ isProjectPm: false }), /Only this project's Project Manager/);
  });

  test("Admin is denied without a reason", () => {
    assert.throws(() => ask({ role: "admin", isProjectPm: false }), (e: { code?: string }) => e.code === "OVERRIDE_REASON_REQUIRED");
    assert.throws(() => ask({ role: "admin", isProjectPm: false, overrideReason: "too short" }), (e: { code?: string }) => e.code === "OVERRIDE_REASON_REQUIRED");
    assert.throws(() => ask({ role: "admin", isProjectPm: false, overrideReason: "          " }), (e: { code?: string }) => e.code === "OVERRIDE_REASON_REQUIRED");
  });

  test("Admin is allowed with a reason of at least 10 characters, which is returned for the audit trail", () => {
    assert.deepEqual(ask({ role: "admin", isProjectPm: false, overrideReason: "  PM is on leave until Monday " }), { override: true, reason: "PM is on leave until Monday" });
    assert.equal(isValidOverrideReason("exactly 10"), true);
    assert.equal(isValidOverrideReason("nine char"), false);
  });

  test("an Admin override does not turn on for other roles", () => {
    for (const role of ["engineer", "architect", "consultant", "site-personnel", "finance-manager", "human-resources", "owner", "it-designer"]) {
      assert.throws(() => ask({ role, isProjectPm: false, overrideReason: "a perfectly good reason" }), /cannot/);
    }
  });

  test("the audit line carries the reason", () => {
    assert.match(overrideSummary("approved requirement X", "PM on leave"), /Admin override: approved requirement X\. Reason: PM on leave/);
  });
});
