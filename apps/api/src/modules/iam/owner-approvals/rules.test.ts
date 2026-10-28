import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_REQUESTS_PER_HOUR,
  PROTECTED_ACTIONS,
  approvalUrl,
  effectiveStatus,
  escapeHtml,
  expiresAtFor,
  isProtectedAction,
  maskEmail,
  needsOwnerApproval,
  overRequestLimit,
} from "./rules.js";
import { TOKEN_PATTERN, evaluateToken, generateToken, hashToken } from "./tokens.js";

const NOW = new Date("2026-10-28T10:00:00Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe("which changes are protected", () => {
  test("the six actions in the brief, and nothing else", () => {
    assert.deepEqual([...PROTECTED_ACTIONS].sort(), ["change_identity", "change_role", "deactivate", "delete", "password_reset", "reactivate"]);
    assert.equal(isProtectedAction("delete"), true);
    assert.equal(isProtectedAction("link_employee"), false);
    assert.equal(isProtectedAction(undefined), false);
  });

  test("the Owner account is gated for everyone but the Owner on themselves", () => {
    const owner = { id: 1, role: "owner" };
    assert.equal(needsOwnerApproval(owner, { id: 2 }), true);
    assert.equal(needsOwnerApproval(owner, undefined), true);
    assert.equal(needsOwnerApproval(owner, { id: 1 }), false);
  });

  test("other accounts are never gated", () => {
    for (const role of ["it-designer", "admin", "human-resources", "project-manager"]) {
      assert.equal(needsOwnerApproval({ id: 5, role }, { id: 2 }), false, role);
    }
  });
});

describe("limits and presentation", () => {
  test("a link lives for the configured number of minutes", () => {
    assert.equal(expiresAtFor(NOW, 60).getTime() - NOW.getTime(), 60 * 60_000);
  });

  test("three requests an hour per requester, then refused; older ones stop counting", () => {
    const recent = [minutes(-5), minutes(-20), minutes(-59)];
    assert.equal(MAX_REQUESTS_PER_HOUR, 3);
    assert.equal(overRequestLimit(recent, NOW), true);
    assert.equal(overRequestLimit(recent.slice(0, 2), NOW), false);
    assert.equal(overRequestLimit([minutes(-5), minutes(-20), minutes(-61)], NOW), false);
  });

  test("the masked address hides the name but keeps the domain", () => {
    assert.equal(maskEmail("owner@gmail.com"), "o***@gmail.com");
    assert.equal(maskEmail("nonsense"), "***");
  });

  test("a pending request past its time reads as expired; decided ones keep their status", () => {
    assert.equal(effectiveStatus({ status: "pending", expiresAt: minutes(-1) }, NOW), "expired");
    assert.equal(effectiveStatus({ status: "pending", expiresAt: minutes(5) }, NOW), "pending");
    assert.equal(effectiveStatus({ status: "approved", expiresAt: minutes(-100) }, NOW), "approved");
  });

  test("email text is escaped and the link points at the browser app", () => {
    assert.equal(escapeHtml(`<b>"x" & 'y'</b>`), "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
    assert.equal(approvalUrl("https://app.example.com/", "abc"), "https://app.example.com/owner-approval/abc");
  });
});

describe("tokens", () => {
  test("a fresh token is 43 url-safe characters, unique, and stored only as a hash", () => {
    const a = generateToken();
    const b = generateToken();
    assert.match(a, TOKEN_PATTERN);
    assert.notEqual(a, b);
    assert.equal(hashToken(a).length, 64);
    assert.notEqual(hashToken(a), a);
    assert.equal(hashToken(a), hashToken(a));
  });

  test("malformed tokens are refused by the pattern", () => {
    for (const bad of ["", "short", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}!`, `../${"a".repeat(40)}`]) {
      assert.equal(TOKEN_PATTERN.test(bad), false, bad);
    }
  });

  test("a request is ok while pending and in time; missing, expired and used otherwise", () => {
    const pending = { status: "pending", expiresAt: minutes(30), decidedAt: null };
    assert.equal(evaluateToken(pending, NOW), "ok");
    assert.equal(evaluateToken(null, NOW), "missing");
    assert.equal(evaluateToken({ ...pending, expiresAt: minutes(-1) }, NOW), "expired");
    assert.equal(evaluateToken({ ...pending, status: "approved", decidedAt: NOW }, NOW), "used");
    assert.equal(evaluateToken({ ...pending, status: "declined", decidedAt: NOW }, NOW), "used");
    assert.equal(evaluateToken({ ...pending, status: "cancelled", decidedAt: null }, NOW), "used");
    assert.equal(evaluateToken({ ...pending, status: "expired", expiresAt: minutes(-1) }, NOW), "expired");
  });

  test("a used request stays used even after its time has passed", () => {
    assert.equal(evaluateToken({ status: "approved", expiresAt: minutes(-90), decidedAt: minutes(-100) }, NOW), "used");
  });
});
