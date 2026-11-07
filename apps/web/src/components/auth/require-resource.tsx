import type { ReactNode } from "react";
import { useRoleConfig } from "@/hooks/use-role-config";
import { ROLE_RESOURCE_ACCESS } from "@/config/role-resources";
import AccessDeniedPage from "@/pages/shared/access-denied";

/** Route guard by resource: the same ROLE_RESOURCE_ACCESS the sidebar uses. Shows the existing Access denied page. */
export function RequireResource({ resource, children }: { resource: string; children: ReactNode }) {
  const { identity } = useRoleConfig();
  if (!(ROLE_RESOURCE_ACCESS[identity.role] ?? []).includes(resource)) return <AccessDeniedPage />;
  return <>{children}</>;
}
