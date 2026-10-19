import type { ReactNode } from "react";
import { useRoleConfig } from "@/hooks/use-role-config";
import AccessDeniedPage from "@/pages/shared/access-denied";

interface RequireRoleProps {
  allow: string[];
  children: ReactNode;
}

export function RequireRole({ allow, children }: RequireRoleProps) {
  const { identity } = useRoleConfig();

  if (!allow.includes(identity.role)) {
    return <AccessDeniedPage />;
  }

  return <>{children}</>;
}
