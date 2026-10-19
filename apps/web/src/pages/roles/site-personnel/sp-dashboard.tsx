// apps/web/src/pages/roles/site-personnel/sp-dashboard.tsx — NEW
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { useNavigate } from "react-router";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { useRoleConfig } from "@/hooks/use-role-config";
import {
  UserCheck,
  CheckSquare,
  ClipboardList,
  ShieldAlert,
  MapPin,
  Camera,
  FileText,
} from "lucide-react";
import { useSpDashboardController } from "@/features/dashboard/controllers/sp-dashboard.controller";
import { WaitingOnYouCard } from "@/features/lifecycle/components/WaitingOnYouCard";


export default function SPDashboardPage() {
  const { identity } = useRoleConfig();
  const navigate = useNavigate();
  const c = useSpDashboardController();

  const firstName = identity.name.split(" ")[0];

  return (
    <div className="flex-1 space-y-10 p-4 md:p-8">
      <PageHeader
        title={<>Good shift, {firstName}.</>}
        description={
          c.today
            ? `You clocked in at ${c.today.clockIn}${c.today.clockOut ? ` and out at ${c.today.clockOut}` : ""} today.`
            : "You haven't logged attendance yet today."
        }
      />

      <KpiStrip
        items={[
          {
            label: "Attendance",
            value: c.today ? c.today.geofence : "Not logged",
            hint: c.today ? c.today.clockIn : "Log attendance to start your shift",
            icon: UserCheck,
            tone: c.today?.geofence === "Inside" ? "good" : c.today ? "bad" : "neutral",
          },
          { label: "Tasks today", value: String(c.taskCounts.total), hint: `${c.taskCounts.pending} pending`, icon: CheckSquare },
          { label: "Field documents", value: String(c.documentCount), hint: "Recent uploads", icon: FileText },
          { label: "Open issues", value: String(c.openIssues), icon: ShieldAlert, tone: c.openIssues > 0 ? "warn" : "neutral" },
        ]}
      />

      {/* K1: cross-project gate checks waiting on this worker */}
      <WaitingOnYouCard />

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Quick actions">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-auto flex-col items-start gap-1 p-4" onClick={() => navigate("/attendance")}>
              <MapPin className="h-4 w-4" />
              <span className="text-sm font-medium">Log attendance</span>
            </Button>
            <Button variant="outline" className="h-auto flex-col items-start gap-1 p-4" onClick={() => navigate("/tasks")}>
              <CheckSquare className="h-4 w-4" />
              <span className="text-sm font-medium">View tasks</span>
            </Button>
            <Button variant="outline" className="h-auto flex-col items-start gap-1 p-4" onClick={() => navigate("/documents")}>
              <Camera className="h-4 w-4" />
              <span className="text-sm font-medium">Upload document</span>
            </Button>
            <Button variant="outline" className="h-auto flex-col items-start gap-1 p-4" onClick={() => navigate("/issues")}>
              <ClipboardList className="h-4 w-4" />
              <span className="text-sm font-medium">Report issue</span>
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Today's tasks">
          {c.loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : c.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks assigned.</p>
          ) : (
            <div className="space-y-2">
              {c.tasks.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-xl border p-3">
                  <div className="text-sm font-medium">{t.title}</div>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

SPDashboardPage.displayName = "SPDashboardPage";