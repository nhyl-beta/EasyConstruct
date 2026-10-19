// apps/web/src/pages/routers/attendance-router.tsx — NEW
// Same role-branching pattern DashboardRouter already uses, applied to the
// three paths that are currently hard-owned by one role's page component
// even though Site Personnel's nav also points at them (see Part 2 preamble).
import { useRoleConfig } from "@/hooks/use-role-config";
import HRAttendance from "@/pages/roles/human-resources/hr-attendance";
import SPAttendancePage from "@/pages/roles/site-personnel/sp-attendance";

export default function AttendanceRouter() {
  const { identity } = useRoleConfig();
  if (identity.role === "site_personnel") return <SPAttendancePage />;
  return <HRAttendance />;
}