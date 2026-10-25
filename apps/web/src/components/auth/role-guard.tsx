import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useRoleConfig } from "@/hooks/use-role-config";
import AccessDeniedPage from "@/pages/shared/access-denied";

interface RequireRoleProps {
  allow: string[];
  children: ReactNode;
  /** Send a disallowed role here instead of showing the access-denied page. */
  redirectTo?: string;
}

export function RequireRole({ allow, children, redirectTo }: RequireRoleProps) {
  const { identity } = useRoleConfig();

  if (!allow.includes(identity.role)) {
    if (redirectTo) return <Navigate to={redirectTo} replace />;
    return <AccessDeniedPage />;
  }

  return <>{children}</>;
}
