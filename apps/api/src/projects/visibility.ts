// apps/api/src/projects/visibility.ts
//
// The pure core of "which projects may this role see": no database, so it is
// unit-testable. projects/service.ts adds the lookups (own projects for a PM,
// project_members rows for staffed roles) on top of it.

/**
 * Roles whose project visibility is their staffing, not the whole portfolio:
 * the ones a PM assigns onto a job through project_members. Admin, IT Designer
 * and Owner oversee everything; HR and Finance work company-wide (payroll,
 * budgets); the PM runs the portfolio (their own projects, see below).
 */
export const MEMBERSHIP_SCOPED_ROLES: ReadonlySet<string> = new Set([
  "engineer",
  "architect",
  "site-personnel",
  "consultant",
]);

export type VisibilityMode = "own-projects" | "staffed-projects" | "all";

export const visibilityModeFor = (role: string): VisibilityMode =>
  role === "project-manager" ? "own-projects" : MEMBERSHIP_SCOPED_ROLES.has(role) ? "staffed-projects" : "all";

export interface VisibilityOptions {
  /** Roles that skip project scoping here because a stricter rule already applies (e.g. site personnel's own tasks). */
  skipRoles?: readonly string[];
}

/** Keeps rows whose project code is in `codes`; `null` means "no restriction". Rows with no project are dropped when restricted. */
export const filterRowsToCodes = <T>(
  rows: T[],
  codes: ReadonlySet<string> | null,
  codeOf: (row: T) => string | null | undefined,
): T[] => {
  if (codes === null) return rows;
  return rows.filter((row) => {
    const code = codeOf(row);
    return !!code && codes.has(code);
  });
};

export const isSkipped = (role: string | undefined, opts: VisibilityOptions): boolean =>
  !!role && !!opts.skipRoles?.includes(role);
