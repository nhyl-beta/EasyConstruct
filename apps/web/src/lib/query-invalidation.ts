// apps/web/src/lib/query-invalidation.ts
//
// What a write invalidates: the resource it wrote and the resources that are
// derived from it (the dashboard summary, a project's progress, the
// "waiting on me" list). Nothing else is refetched. Mirrors the server's own
// cache invalidation rules (apps/api/src/cache/invalidate.ts).
import { queryClient } from "./query-client";
import { resourceOf } from "./query-keys";

const DESIGN_FAMILY = ["designs", "design-reviews", "design-revisions", "blueprints", "architect-documents", "revisions"];
const REQUEST_FAMILY = ["design-requests", "transmittals", "deliverables"];

/**
 * Resource written -> resources whose cached reads it can change. Anything not
 * listed refreshes itself, the dashboard summary and "waiting on me".
 */
const AFFECTED: Record<string, string[]> = {
  // Touch only themselves and the dashboards.
  attendance: ["attendance", "dashboard"],
  employees: ["employees", "dashboard"],
  roles: ["roles", "dashboard"],
  users: ["users", "roles", "dashboard"],
  "audit-logs": ["audit-logs", "dashboard"],
  notifications: [],
  auth: [],
  uploads: [],
  // Move a project's progress / status, so the project reads and the roll-ups follow.
  projects: ["projects", "dashboard", "lifecycle", "calendar", "workflows"],
  tasks: ["tasks", "milestones", "projects", "dashboard", "lifecycle"],
  issues: ["issues", "projects", "dashboard", "lifecycle"],
  milestones: ["milestones", "tasks", "projects", "dashboard", "lifecycle", "calendar"],
  documents: ["documents", "projects", "dashboard", "lifecycle"],
  requirements: ["requirements", "projects", "dashboard", "lifecycle"],
  "engineering-reports": ["engineering-reports", "projects", "dashboard", "lifecycle"],
  proposals: ["proposals", "workflows", "projects", "dashboard", "lifecycle", "calendar"],
  workflows: ["workflows", "proposals", "finance", "projects", "dashboard", "lifecycle", "calendar"],
  payroll: ["payroll", "finance", "workflows", "projects", "dashboard", "lifecycle"],
  finance: ["finance", "payroll", "workflows", "projects", "dashboard", "lifecycle"],
  "project-members": ["project-members", "projects", ...DESIGN_FAMILY, "dashboard", "lifecycle", "calendar"],
  ...Object.fromEntries(DESIGN_FAMILY.map((r) => [r, [...DESIGN_FAMILY, "projects", "dashboard", "lifecycle"]])),
  ...Object.fromEntries(REQUEST_FAMILY.map((r) => [r, [...REQUEST_FAMILY, "dashboard", "lifecycle"]])),
};

export const resourcesAffectedBy = (writeRoot: string): string[] =>
  AFFECTED[writeRoot] ?? [writeRoot, "dashboard", "lifecycle"];

/** Invalidates the queries a write to `path` can have changed. Active ones refetch now, the rest on next use. */
export const invalidateAfterWrite = (path: string) => {
  const affected = new Set(resourcesAffectedBy(resourceOf(path)));
  if (affected.size === 0) return Promise.resolve();
  return queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] === "api" && affected.has(String(query.queryKey[1])),
  });
};
