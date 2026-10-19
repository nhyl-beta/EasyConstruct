import {
  Banknote,
  Bell,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  FolderKanban,
  GitBranch,
  ShieldAlert,
  Users,
} from "lucide-react";

import { PageHeader } from "@/components/refine-ui/views/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComingSoonCard } from "@/components/refine-ui/views/coming-soon-card";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Progress } from "@/components/ui/progress";
import { useRoleConfig } from "@/hooks/use-role-config";
import { useAdminDashboardController } from "@/features/dashboard/controllers/admin-dashboard.controller";
import { WaitingOnYouCard } from "@/features/lifecycle/components/WaitingOnYouCard";
import { UsefulnessCard } from "@/features/decision-support/UsefulnessCard";
import { CycleTimesCard } from "@/features/dashboard/components/CycleTimesCard";
import { AttentionCard } from "@/features/requests/components/AttentionCard";
import { RefreshReferencesCard } from "@/features/lifecycle/components/RefreshReferencesCard";
import { WorkforceSnapshotCard } from "@/features/workforce/components/WorkforceSnapshotCard";
import { FEATURES } from "@/config/features";
import { formatDue } from "@/features/projects/lib/project-format";
import { useNavigate } from "react-router";

const riskToneClasses: Record<string, string> = {
  high: "text-destructive-strong font-medium",
  // text-warning-strong, not text-warning-foreground — see the note in
  // project-status.ts's RISK_CLASS.
  medium: "text-warning-strong font-medium",
  low: "text-muted-foreground",
};

export default function AdminDashboardPage() {
  const { identity } = useRoleConfig();
  const navigate = useNavigate();
  const c = useAdminDashboardController();
  const firstName = identity.name.split(" ")[0];

  return (
    <div className="flex-1 space-y-10 p-4 md:p-8">
      {/* ── Hero header ── */}
      <PageHeader
        title={<>Operations overview, {firstName}.</>}
        status={<StatusBadge status="Live data" tone="brand" />}
        description={c.loading
              ? "Loading operational data…"
              : `${c.totalProjectCount} project${c.totalProjectCount === 1 ? "" : "s"} · ${c.activeWorkflowCount} active workflow${c.activeWorkflowCount === 1 ? "" : "s"} · ${c.pendingApprovals} approval${c.pendingApprovals === 1 ? "" : "s"} pending across the organization.`}
        actions={
          <>
          <Button
            variant="quiet"
            onClick={() => navigate("/admin/workflows")}
          >
            <GitBranch className="h-4 w-4" />
            Workflows
          </Button>
          <Button onClick={() => navigate("/admin/projects")}>
            <FolderKanban className="h-4 w-4" />
            Projects
          </Button>
          </>
        }
      />

      {/* ── KPI grid ── */}
      <KpiStrip
        items={[
          { label: "Total projects", value: `${c.kpis.total}`, icon: FolderKanban },
          { label: "At risk", value: `${c.kpis.atRisk}`, icon: ShieldAlert, tone: "warn" },
          { label: "Over budget", value: `${c.overBudget}`, icon: Banknote, tone: c.overBudget > 0 ? "bad" : "neutral" },
          {
            label: "Pending approvals",
            value: `${c.pendingApprovals}`,
            icon: ClipboardCheck,
            tone: c.pendingApprovals > 0 ? "warn" : "good",
          },
        ]}
      />
      <KpiStrip
        items={[
          { label: "Active workflows", value: `${c.activeWorkflowCount}`, icon: GitBranch },
          { label: "Completed workflows", value: `${c.completedWorkflowCount}`, icon: FileCheck2, tone: "good" },
          {
            label: "Unread notifications",
            value: `${c.unreadNotificationCount}`,
            icon: Bell,
            tone: c.unreadNotificationCount > 0 ? "warn" : "neutral",
          },
          {
            label: "Proposals pending",
            value: `${c.proposalsKpis.pending}`,
            icon: Users,
            tone: c.proposalsKpis.pending > 0 ? "warn" : "neutral",
          },
        ]}
      />

      {/* K1: admin can decide any workflow stage (EC-003) — cross-project */}
      <AttentionCard />

      <WaitingOnYouCard />

      {/* Fix 1.4: how long approvals, responses, payroll sign-off and issue resolution take */}
      <CycleTimesCard />
      <UsefulnessCard />

      {/* ai-signals E6: nice-to-have manual refresh, admin only */}
      {FEATURES.ai && <RefreshReferencesCard />}

      {/* ── Main grid — projects table + activity feed ── */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-lg">Projects needing attention</CardTitle>
              <p className="text-xs text-muted-foreground">
                {c.projectsLoading
                  ? "Loading…"
                  : `${Math.min(5, c.totalProjectCount)} of ${c.totalProjectCount} — sorted by risk and budget overrun`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => navigate("/admin/projects")}
            >
              View all <ChevronRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {c.projectsLoading ? (
              <div className="p-5 text-sm text-muted-foreground">Loading projects…</div>
            ) : c.projectsError ? (
              <div className="p-5 text-sm text-destructive-strong">
                Couldn't load projects. {c.projectsError.message}
              </div>
            ) : c.topProjects.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No projects yet.{" "}
                <button
                  className="text-primary-strong underline-offset-2 hover:underline"
                  onClick={() => navigate("/admin/projects")}
                >
                  Create one
                </button>
                .
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border bg-muted/40 text-left text-overline font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-2.5 font-medium">Project</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">Progress</th>
                      <th className="px-3 py-2.5 font-medium">Budget</th>
                      <th className="px-3 py-2.5 font-medium">Due</th>
                      <th className="px-5 py-2.5 font-medium">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.topProjects.map((p) => (
                      <tr
                        key={p.code}
                        className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                        onClick={() => navigate("/admin/projects")}
                      >
                        <td className="px-5 py-3.5">
                          <div className="font-medium leading-tight">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.code}</div>
                        </td>
                        <td className="px-3 py-3.5">
                          <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-overline font-medium">
                            {p.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-3.5">
                          <div className="flex items-center gap-2">
                            <Progress value={p.progress} className="h-1.5 w-24" />
                            <span className="w-9 text-xs tabular-nums text-muted-foreground">
                              {p.progress}%
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <span
                            className={
                              p.budget > 100
                                ? "text-sm font-medium tabular-nums text-destructive-strong"
                                : "text-sm tabular-nums"
                            }
                          >
                            {p.budget}%
                          </span>
                        </td>
                        <td className="px-3 py-3.5 text-sm tabular-nums text-muted-foreground">
                          {formatDue(p.due)}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs capitalize ${riskToneClasses[p.risk] ?? "text-muted-foreground"}`}>
                            {p.risk}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity — real, from /api/audit-logs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg">Recent activity</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => navigate("/admin/activity-logs")}
            >
              View all <ChevronRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {c.auditLogsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : c.recentActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recorded activity yet.</p>
            ) : (
              c.recentActivity.map((log) => (
                <div key={log.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <p className="text-sm font-medium leading-tight">
                    {log.actor} <span className="font-normal text-muted-foreground">{log.action}</span>{" "}
                    {log.entityType} {log.entityId}
                  </p>
                  {log.summary && (
                    <p className="text-xs text-muted-foreground">{log.summary}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Bottom row — notifications + workforce/proposals ── */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg">Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {c.notificationsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : c.recentNotifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notifications.</p>
            ) : (
              c.recentNotifications.map((n) => (
                <div key={n.id} className="flex items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.isRead ? "bg-muted-foreground/30" : "bg-primary"}`} />
                  <div>
                    <p className="text-sm font-medium leading-tight">{n.title}</p>
                    {n.message && <p className="text-xs text-muted-foreground">{n.message}</p>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Part C3: was a ComingSoonCard claiming no cross-project
            attendance/workforce endpoint exists. GET /employees and
            GET /attendance were both already org-wide, unfiltered reads
            (see apps/api/src/employees/routes.ts, attendance/routes.ts) —
            the gap was a client-side rollup, not a missing backend. Real
            data via useWorkforceSnapshot, the same hook E3 wires HR's
            WorkforceSection to. */}
        <WorkforceSnapshotCard />
      </section>

      {/* ── Footer status ── */}
      <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
        <FileCheck2 className="h-3 w-3" />
        Live operational data{c.loading ? " · loading…" : ""}
      </div>
    </div>
  );
}
