// Pure matching for `npm run db:backfill-employee-links`: which unlinked employee belongs to which account.
// Case-insensitive on email; a link is made only when exactly one employee and exactly one account share the
// email. Anything else is reported and left alone. Never deletes or overwrites.

export interface PlanEmployee {
  id: number;
  employeeId: string;
  name: string;
  email: string | null;
  userId: number | null;
}

export interface PlanUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface LinkPlan {
  /** employees.id -> users.id */
  links: { employeeRowId: number; employeeId: string; userId: number; email: string }[];
  ambiguous: { email: string; employees: string[]; users: string[] }[];
  /** Accounts that already belong to another employee (the unique index would refuse a second one). */
  alreadyLinked: { employeeId: string; userEmail: string }[];
  /** Accounts left with no employee after this plan. */
  accountsWithoutEmployee: PlanUser[];
}

const key = (email: string) => email.trim().toLowerCase();

export const planEmployeeLinks = (employees: PlanEmployee[], users: PlanUser[]): LinkPlan => {
  const linkedUserIds = new Set(employees.filter((e) => e.userId != null).map((e) => e.userId as number));
  const unlinked = employees.filter((e) => e.userId == null && e.email && e.email.trim());

  const employeesByEmail = new Map<string, PlanEmployee[]>();
  for (const e of unlinked) {
    const k = key(e.email!);
    employeesByEmail.set(k, [...(employeesByEmail.get(k) ?? []), e]);
  }
  const usersByEmail = new Map<string, PlanUser[]>();
  for (const u of users) {
    const k = key(u.email);
    usersByEmail.set(k, [...(usersByEmail.get(k) ?? []), u]);
  }

  const plan: LinkPlan = { links: [], ambiguous: [], alreadyLinked: [], accountsWithoutEmployee: [] };
  const willLink = new Set<number>();

  for (const [email, emps] of employeesByEmail) {
    const accounts = usersByEmail.get(email) ?? [];
    if (accounts.length === 0) continue; // a roster employee with no login: nothing to report
    if (emps.length > 1 || accounts.length > 1) {
      plan.ambiguous.push({ email, employees: emps.map((e) => e.employeeId), users: accounts.map((u) => String(u.id)) });
      continue;
    }
    const emp = emps[0]!;
    const user = accounts[0]!;
    if (linkedUserIds.has(user.id)) {
      plan.alreadyLinked.push({ employeeId: emp.employeeId, userEmail: user.email });
      continue;
    }
    plan.links.push({ employeeRowId: emp.id, employeeId: emp.employeeId, userId: user.id, email: user.email });
    willLink.add(user.id);
  }

  plan.accountsWithoutEmployee = users.filter((u) => !linkedUserIds.has(u.id) && !willLink.has(u.id));
  return plan;
};
