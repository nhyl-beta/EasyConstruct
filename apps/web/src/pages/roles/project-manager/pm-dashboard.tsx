import {
  Activity,
  Banknote,
  ChevronRight,
  FileCheck2,
  FolderKanban,
  ShieldAlert,
} from "lucide-react";

import { PageHeader } from "@/components/refine-ui/views/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PmPortfolioCharts } from "@/features/dashboard/components/PmPortfolioCharts";
import { WaitingOnYouCard } from "@/features/lifecycle/components/WaitingOnYouCard";
import { AwaitingApprovalCard } from "@/features/workflows/components/AwaitingApprovalCard";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Progress } from "@/components/ui/progress";
import { useRoleConfig } from "@/hooks/use-role-config";
import { usePmDashboardController } from "@/features/dashboard/controllers/pm-dashboard.controller";
import { formatDue } from "@/features/projects/lib/project-format";
import { useNavigate } from "react-router";

// ── Badge tone map (kept for risk labels, which are still free-text) ─────────

const riskToneClasses: Record<string, string> = {
  high: "text-destructive-strong font-medium",
  // text-warning-strong, not text-warning-foreground — see the note in
  // project-status.ts's RISK_CLASS.
  medium: "text-warning-strong font-medium",
  low: "text-muted-foreground",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { identity } = useRoleConfig();
  const navigate = useNavigate();
  const c = usePmDashboardController();
  const firstName = identity.name.split(" ")[0];

  return (
    <div className="flex-1 space-y-10 p-4 md:p-8">
      {/* ── Hero header ── */}
      <PageHeader
        title={<>Good morning, {firstName}.</>}
        status={<StatusBadge status="Live data" tone="brand" />}
        description={c.loading
              ? "Loading your portfolio…"
              : `${c.totalProjectCount} project${c.totalProjectCount === 1 ? "" : "s"} in your portfolio. ${c.riskBreakdown.high} at high risk, ${c.overBudget} over budget.`}
        actions={
          <>
          <Button
            variant="quiet"
            onClick={() => navigate("/projects")}
          >
            <FolderKanban className="h-4 w-4" />
            All projects
          </Button>
          </>
        }
      />

      {/* ── KPI grid — real, from /api/projects ── */}
      <KpiStrip
        items={[
          { label: "Total projects", value: `${c.kpis.total}`, icon: FolderKanban },
          { label: "On track", value: `${c.kpis.onTrack}`, icon: Activity, tone: "good" },
          { label: "At risk", value: `${c.kpis.atRisk}`, icon: ShieldAlert, tone: "warn" },
          { label: "Over budget", value: `${c.overBudget}`, icon: Banknote, tone: c.overBudget > 0 ? "bad" : "neutral" },
        ]}
      />

      <PmPortfolioCharts phases={c.phases} workload={c.workload} loading={c.loading} />

      {/* ── Main grid — projects table + not-yet-connected AI panel ── */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Projects table — real */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-lg">Needs attention</CardTitle>
              <p className="text-xs text-muted-foreground">
                {c.loading
                  ? "Loading…"
                  : `${Math.min(5, c.totalProjectCount)} of ${c.totalProjectCount} — sorted by risk and budget overrun`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => navigate("/projects")}
            >
              View all <ChevronRight className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {c.loading ? (
              <div className="p-5 text-sm text-muted-foreground">Loading projects…</div>
            ) : c.error ? (
              <div className="p-5 text-sm text-destructive-strong">
                Couldn't load projects. {c.error.message}
              </div>
            ) : c.topProjects.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No projects yet.{" "}
                <button
                  className="text-primary-strong underline-offset-2 hover:underline"
                  onClick={() => navigate("/projects")}
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
                        onClick={() => navigate("/projects")}
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

        {/* K1/ai-signals E3: cross-project gate checks + advisory signals
            waiting on this PM — this already IS the AI-insights summary
            (Sparkles-badged "signal" items), so no separate placeholder
            card is needed in this slot. */}
        <WaitingOnYouCard />
      </section>

      {/* Part C1: "Awaiting your approval" was a ComingSoonCard claiming
          "no approvals backend exists yet" — false. GET
          /workflows/approvals(?scope=pending)/stats is real and already
          used by ApprovalQueuePanel/pm-approvals.tsx; AwaitingApprovalCard
          reads the same data. "Site advisories aren't backed by any table"
          was also false — that's exactly what the five signal rules
          produce, and WaitingOnYouCard (above) already renders them
          cross-project via the same GET /lifecycle/my-actions path
          DecisionSupportSection uses, with an "AI" badge. A general
          cross-project *activity feed* (distinct from advisories/approvals)
          genuinely has no backend, so its placeholder card was removed. */}
      <section className="grid grid-cols-1 gap-6">
        <AwaitingApprovalCard />
      </section>

      {/* ── Footer status ── */}
      <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
        <FileCheck2 className="h-3 w-3" />
        Live project data{c.loading ? " · loading…" : ""}
      </div>
    </div>
  );
}