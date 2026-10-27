// How an account's employee link shows in the IT Designer accounts table. Mirrors apps/api/src/modules/iam/users/linking.ts.
import type { StatusTone } from "@/config/status-tone";

/** Roles whose people clock in or are paid, so they need an employee record. Owner, Admin and IT Designer may stay unlinked. */
const ROLES_NEEDING_EMPLOYEE = [
  "site-personnel",
  "engineer",
  "project-manager",
  "architect",
  "consultant",
  "finance-manager",
  "human-resources",
];

export interface LinkableAccount {
  role: string;
  isActive: boolean;
  employeeCode?: string | null;
  employeeStatus?: string | null;
}

export const isLinked = (user: LinkableAccount): boolean => !!user.employeeCode;

/** Badge for the "Employee record" column: the employee code, or "Unlinked" (amber when it matters, neutral otherwise). */
export function employeeBadge(user: LinkableAccount): { label: string; tone: StatusTone } {
  if (user.employeeCode) return { label: user.employeeCode, tone: "success" };
  return { label: "Unlinked", tone: ROLES_NEEDING_EMPLOYEE.includes(user.role) ? "warning" : "neutral" };
}

/** A line to show under the badge, or null. */
export function accountLinkWarning(user: LinkableAccount): string | null {
  if (!user.employeeCode) {
    if (!ROLES_NEEDING_EMPLOYEE.includes(user.role)) return null;
    return user.role === "site-personnel"
      ? "Attendance and payroll will not work until this account is linked to an employee."
      : "Payroll will not include this person until this account is linked to an employee.";
  }
  if (user.isActive && user.employeeStatus && user.employeeStatus !== "Active") {
    return `The employee record is ${user.employeeStatus}, but this account is still active. Review the account.`;
  }
  return null;
}
