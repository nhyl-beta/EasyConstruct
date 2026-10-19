// src/hooks/use-role-config.ts
import { MOCK_IDENTITY, type AppIdentity } from "../config/mock-role";
import { DEFAULT_ROLE_CONFIG, ROLE_CONFIGS } from "../config/role-tab";
import { useAuth } from "@/auth/auth-context";
import { toFrontendRole } from "@/config/role-mapping";

export function useRoleConfig() {
  const { user } = useAuth();
  const role = user ? toFrontendRole(user.role) : undefined;
  const identity: AppIdentity = user
    ? { name: user.name, role: role ?? "project_manager" }
    : MOCK_IDENTITY;
  const config = ROLE_CONFIGS[identity.role] ?? DEFAULT_ROLE_CONFIG;

  return { identity, config };
}
