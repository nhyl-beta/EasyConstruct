import { useRoleConfig } from "@/hooks/use-role-config";
import { CalendarWidget } from "@/features/calendar/components/CalendarWidget";
import HRDashboardPage from "@/pages/roles/human-resources/hr-dashboard";
import PMDashboardPage from "@/pages/roles/project-manager/pm-dashboard";
import ArchitectDashboard from "../roles/architect/architect-dashboard";
import FinanceDashboardPage from "../roles/finance/finance-dashboard";
import EngineerDashboardPage from "../roles/engineer/engineer-dashboard";
import SPDashboardPage from "../roles/site-personnel/sp-dashboard";
import ConsultantDashboardPage from "../roles/consultant/consultant-dashboard";
import AdminDashboardPage from "../roles/admin/admin-dashboard";
import OwnerDashboardPage from "../roles/owner/owner-dashboard";
import ITDesignerDashboardPage from "../roles/it-designer/it-designer-dashboard";

// ── Role → Dashboard map ──────────────────────────────────────────────────────

const ROLE_DASHBOARD: Record<string, React.ComponentType> = {
  project_manager: PMDashboardPage,
  human_resources: HRDashboardPage,
  finance_manager: FinanceDashboardPage,
  architect: ArchitectDashboard,
  engineer: EngineerDashboardPage,
  site_personnel: SPDashboardPage,
  consultant:      ConsultantDashboardPage,
  admin:           AdminDashboardPage,
  owner:           OwnerDashboardPage,
  it_designer:     ITDesignerDashboardPage,
};

// Fallback for roles without a dashboard yet
function FallbackDashboard() {
  const { identity } = useRoleConfig();
  const role = identity.role;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium text-foreground">
        Dashboard for <span className="text-primary-strong">{role}</span> is coming
        soon.
      </p>
      <p className="text-xs text-muted-foreground">
        This workspace is under construction.
      </p>
    </div>
  );
}

export default function DashboardRouter() {
  const { identity } = useRoleConfig();
  const role = identity.role;
  const Dashboard = ROLE_DASHBOARD[role] ?? FallbackDashboard;
  return (
    <>
      <Dashboard />
      {/* Moved here from its own sidebar page (/calendar) — one calendar,
          rendered at the bottom of every role's dashboard instead of a
          separate nav entry. Same padding convention each dashboard's own
          root div already uses (p-4 md:p-8); no top padding since the
          dashboard above it already ends with its own bottom spacing. */}
      <div className="px-4 pb-4 md:px-8 md:pb-8">
        <CalendarWidget />
      </div>
    </>
  );
}