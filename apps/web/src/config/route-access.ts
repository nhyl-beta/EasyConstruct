import { ROLE_RESOURCE_ACCESS } from "@/config/role-resources";
import { resources } from "@/providers/resources";

// One answer to "may this role open this path?", used by every card or link that
// carries a "Go to ..." target, and by the route guard (RequireResource).
// Source of truth: ROLE_RESOURCE_ACCESS (which resource a role has) and the
// resource list paths in providers/resources.ts. A path that belongs to no
// resource (e.g. /reports, /settings, /dashboard) is open to every signed-in role.

const PROJECT_RESOURCES = ["projects", "admin-projects", "architect-projects", "consultant-projects"];

// Paths with their own rule in App.tsx (RequireRole) that the resource list cannot express.
const PROJECT_CREATE_ROLES = ["project_manager", "admin"];

function resourcePrefixes(): { prefix: string; resource: string }[] {
  return resources
    .filter((r) => typeof r.list === "string")
    .map((r) => ({ prefix: r.list as string, resource: r.name }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
}

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function canAccessPath(role: string | undefined, rawPath: string | null | undefined): boolean {
  if (!role || !rawPath) return false;
  const path = rawPath.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  if (!path.startsWith("/")) return false; // external or malformed targets are never in-app links
  const owned = ROLE_RESOURCE_ACCESS[role] ?? [];

  if (under(path, "/projects/create") || under(path, "/projects/new")) return PROJECT_CREATE_ROLES.includes(role);
  if (path.startsWith("/projects/")) return PROJECT_RESOURCES.some((r) => owned.includes(r));

  const match = resourcePrefixes().find((p) => under(path, p.prefix));
  if (!match) return true;
  return owned.includes(match.resource);
}

/** The target if the role may open it, otherwise null (render plain text instead of a link). */
export function accessibleLink(role: string | undefined, path: string | null | undefined): string | null {
  return path && canAccessPath(role, path) ? path : null;
}
