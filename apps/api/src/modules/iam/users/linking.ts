// Rules for tying an account to an employee record (employees.user_id). Pure, so they are unit-tested
// without a database; users/service.ts applies them inside the account-creation transaction.
import { ConflictError, NotFoundError, ValidationError } from "../../../core/utils/errors.js";

export interface LinkableEmployee {
  id: number;
  employeeId: string;
  name: string;
  email: string | null;
  status: string;
  userId: number | null;
}

/** Only an Active employee can be given an account. */
export const ACTIVE_EMPLOYEE_STATUS = "Active";

const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Throws unless this employee can be given (or linked to) an account. Returns the email to use. */
export const assertEmployeeLinkable = (employee: LinkableEmployee | null | undefined, employeeKey?: number | string): string => {
  if (!employee) throw new NotFoundError("Employee", employeeKey === undefined ? undefined : String(employeeKey));
  if (employee.status !== ACTIVE_EMPLOYEE_STATUS) {
    throw new ValidationError(`Employee ${employee.name} (${employee.employeeId}) is ${employee.status}, not Active, so they cannot be given an account`);
  }
  if (employee.userId != null) {
    throw new ConflictError(`Employee ${employee.name} (${employee.employeeId}) already has an account`);
  }
  if (!employee.email || !employee.email.trim()) {
    throw new ValidationError(`Employee ${employee.name} (${employee.employeeId}) has no email address on record. Ask HR to add one first`);
  }
  return employee.email.trim();
};

/** Linking an EXISTING account: the employee's email must be the account's email, so the two never disagree. */
export const assertLinkEmailsMatch = (accountEmail: string, employeeEmail: string, employee: Pick<LinkableEmployee, "name" | "employeeId">): void => {
  if (!sameEmail(accountEmail, employeeEmail)) {
    throw new ValidationError(
      `The account email (${accountEmail}) does not match ${employee.name}'s employee email (${employeeEmail}). Correct one of them first, then link`,
    );
  }
};

/** Roles whose people are paid or clock in, so attendance and payroll need their employee record. */
export const ROLES_NEEDING_EMPLOYEE = ["site-personnel", "engineer", "project-manager", "architect", "consultant", "finance-manager", "human-resources"] as const;

export const roleNeedsEmployee = (role: string): boolean => (ROLES_NEEDING_EMPLOYEE as readonly string[]).includes(role);

/** Owner, Admin and IT Designer may stay unlinked. */
export const unlinkedWarning = (role: string, hasEmployee: boolean): string | null => {
  if (hasEmployee || !roleNeedsEmployee(role)) return null;
  return role === "site-personnel"
    ? "Attendance and payroll will not work until this account is linked to an employee."
    : "Payroll will not include this person until this account is linked to an employee.";
};
