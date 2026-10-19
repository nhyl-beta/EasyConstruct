// apps/api/src/cache/scope.ts
//
// Who may share a cache entry. A response that depends on the caller must be
// keyed by that dependence: the user for roles whose data is their own
// assignments, the role for roles that see the same org-wide data, `all` only
// where the handler never looks at who is asking.
import { MEMBERSHIP_SCOPED_ROLES } from "../../projects/visibility.js";

export interface ScopeAuth {
  id: number;
  role: string;
}

/** Roles whose project-visible data is their own portfolio (PM) or staffing. */
const USER_SCOPED_ROLES: ReadonlySet<string> = new Set(["project-manager", ...MEMBERSHIP_SCOPED_ROLES]);

/**
 * Scope for responses shaped by project visibility (project lists, dashboards):
 * `user:<id>` for a PM or a staffed role, `role:<role>` for everyone else
 * (admin, owner, IT designer, HR, finance see the same rows within their role).
 * An unauthenticated caller never gets a shared scope.
 */
export const visibilityScope = (auth: ScopeAuth | undefined): string | null => {
  if (!auth) return null;
  return USER_SCOPED_ROLES.has(auth.role) ? `user:${auth.id}` : `role:${auth.role}`;
};

export const userScope = (auth: ScopeAuth | undefined): string | null => (auth ? `user:${auth.id}` : null);
