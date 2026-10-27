import { describe, expect, it } from "vitest";
import { accountLinkWarning, employeeBadge, isLinked } from "./account-link";

describe("employeeBadge", () => {
  it("shows the employee code when linked", () => {
    expect(employeeBadge({ role: "engineer", isActive: true, employeeCode: "EMP-014" })).toEqual({ label: "EMP-014", tone: "success" });
  });
  it("flags an unlinked account as Unlinked, amber for roles that need an employee", () => {
    expect(employeeBadge({ role: "site-personnel", isActive: true })).toEqual({ label: "Unlinked", tone: "warning" });
  });
  it("is neutral for owner, admin and IT designer", () => {
    for (const role of ["owner", "admin", "it-designer"]) {
      expect(employeeBadge({ role, isActive: true })).toEqual({ label: "Unlinked", tone: "neutral" });
    }
  });
});

describe("accountLinkWarning", () => {
  it("warns that attendance and payroll need a link for site personnel", () => {
    expect(accountLinkWarning({ role: "site-personnel", isActive: true })).toMatch(/Attendance and payroll/);
  });
  it("does not warn for owner, admin and IT designer", () => {
    expect(accountLinkWarning({ role: "owner", isActive: true })).toBeNull();
  });
  it("warns when an active account belongs to an employee who is no longer Active", () => {
    expect(accountLinkWarning({ role: "engineer", isActive: true, employeeCode: "EMP-1", employeeStatus: "Archived" })).toMatch(/Archived/);
    expect(accountLinkWarning({ role: "engineer", isActive: false, employeeCode: "EMP-1", employeeStatus: "Archived" })).toBeNull();
  });
  it("isLinked follows the employee code", () => {
    expect(isLinked({ role: "engineer", isActive: true })).toBe(false);
    expect(isLinked({ role: "engineer", isActive: true, employeeCode: "EMP-1" })).toBe(true);
  });
});
