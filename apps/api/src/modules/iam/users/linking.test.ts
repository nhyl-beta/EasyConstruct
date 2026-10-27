import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  assertEmployeeLinkable,
  assertLinkEmailsMatch,
  roleNeedsEmployee,
  unlinkedWarning,
  type LinkableEmployee,
} from "./linking.js";
import { ConflictError, NotFoundError, ValidationError } from "../../../core/utils/errors.js";

const employee = (patch: Partial<LinkableEmployee> = {}): LinkableEmployee => ({
  id: 7,
  employeeId: "EMP-007",
  name: "Rico Domingo",
  email: "rico@example.com",
  status: "Active",
  userId: null,
  ...patch,
});

describe("assertEmployeeLinkable", () => {
  test("an active employee with an email and no account is accepted; the email comes from the record", () => {
    assert.equal(assertEmployeeLinkable(employee({ email: "  rico@example.com " })), "rico@example.com");
  });

  test("an unknown employee is not found", () => {
    assert.throws(() => assertEmployeeLinkable(null, 99), NotFoundError);
  });

  test("an inactive employee is rejected", () => {
    for (const status of ["Archived", "Suspended", "On Leave", "Inactive"]) {
      assert.throws(() => assertEmployeeLinkable(employee({ status })), ValidationError);
    }
  });

  test("an employee that already has an account is rejected (same employee twice)", () => {
    assert.throws(() => assertEmployeeLinkable(employee({ userId: 12 })), ConflictError);
  });

  test("an employee without an email is rejected", () => {
    assert.throws(() => assertEmployeeLinkable(employee({ email: null })), ValidationError);
    assert.throws(() => assertEmployeeLinkable(employee({ email: "   " })), ValidationError);
  });
});

describe("assertLinkEmailsMatch", () => {
  test("case and spacing do not matter", () => {
    assert.doesNotThrow(() => assertLinkEmailsMatch("Rico@Example.com", " rico@example.com", employee()));
  });
  test("different emails are refused", () => {
    assert.throws(() => assertLinkEmailsMatch("a@example.com", "b@example.com", employee()), ValidationError);
  });
});

describe("unlinkedWarning", () => {
  test("site personnel without an employee are warned about attendance and payroll", () => {
    assert.match(unlinkedWarning("site-personnel", false)!, /Attendance and payroll/);
  });
  test("payroll roles are warned too", () => {
    assert.match(unlinkedWarning("engineer", false)!, /Payroll/);
    assert.equal(roleNeedsEmployee("project-manager"), true);
  });
  test("owner, admin and IT designer may stay unlinked without a warning", () => {
    for (const role of ["owner", "admin", "it-designer"]) assert.equal(unlinkedWarning(role, false), null);
  });
  test("a linked account has no warning", () => {
    assert.equal(unlinkedWarning("site-personnel", true), null);
  });
});
