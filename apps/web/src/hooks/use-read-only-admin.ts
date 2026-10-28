import { useRoleConfig } from "@/hooks/use-role-config";

/**
 * Admin runs the project portfolio but only monitors HR, payroll, attendance and accounts: the API refuses
 * those writes with 403. This hides the matching buttons for Admin so they are not offered. The API guard is
 * the control; this is only courtesy.
 */
export function useIsReadOnlyAdmin(): boolean {
  return useRoleConfig().identity.role === "admin";
}
