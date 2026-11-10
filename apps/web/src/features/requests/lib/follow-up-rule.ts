/** Roles that may raise a request or follow one up. Mirrors the API (design-requests routes: PM, Engineer, Admin). */
export const REQUEST_RAISER_ROLES: ReadonlySet<string> = new Set(["project-manager", "engineer", "admin"]);

/** B-209 / D3: the Follow up button is for raisers, on a request that has been sent and is not closed. */
export const canFollowUpRequest = (role: string, status: string): boolean =>
  REQUEST_RAISER_ROLES.has(role) && status !== "draft" && status !== "closed";
