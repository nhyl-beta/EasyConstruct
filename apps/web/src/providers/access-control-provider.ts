// src/providers/access-control-provider.ts
import type { AccessControlProvider } from "@refinedev/core";
import { ROLE_RESOURCE_ACCESS } from "@/config/role-resources";
import { toFrontendRole } from "@/config/role-mapping";

export const accessControlProvider: AccessControlProvider = {
  can: async ({ resource, action }) => {
    const rawUser = sessionStorage.getItem("easyconstruct_user")
      ?? localStorage.getItem("easyconstruct_user");
    let role = "project_manager";
    if (rawUser) {
      try {
        role = toFrontendRole((JSON.parse(rawUser) as { role: string }).role);
      } catch {
        role = "project_manager";
      }
    }
    const allowed = ROLE_RESOURCE_ACCESS[role] ?? [];

    // No resource means a page-level check — allow
    if (!resource) return { can: true };

    const canAccess = allowed.includes(resource);

    console.log(`[ACL] role=${role} resource=${resource} action=${action} → ${canAccess}`);

    return { can: canAccess };
  },
};