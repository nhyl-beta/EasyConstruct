import {
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FileSearch,
  FolderKanban,
  Sparkles,
  Upload,
} from "lucide-react";

import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import { useRoleConfig } from "@/hooks/use-role-config";
import { useConsultantDashboardController } from "@/features/dashboard/controllers/consultant-dashboard.controller";
import { WaitingOnYouCard } from "@/features/lifecycle/components/WaitingOnYouCard";
import { useNavigate } from "react-router";

export default function ConsultantDashboardPage() {
  const { identity } = useRoleConfig();
  const navigate = useNavigate();
  const c = useConsultantDashboardController();

  const firstName = identity.name.split(" ")[0];

  return (
    <div className="flex-1 space-y-10 p-4 md:p-8">
      {/* ── Hero header ── */}
      <PageHeader
        title={<>Welcome back, {firstName}.</>}
        status={<StatusBadge status="Advisory access" tone="brand" />}
        description={c.loading
              ? "Loading your advisory queue…"
              : `${c.kpis.pendingReviews} proposal${
                  c.kpis.pendingReviews === 1 ? "" : "s"
                } awaiting your review across ${
                  c.kpis.activeProjects
                } active project${
                  c.kpis.activeProjects === 1 ? "" : "s"
                }.`}
        actions={
          <>
          <Button
            variant="quiet"
            onClick={() => navigate("/advisory-docs")}
          >
            <Upload className="h-4 w-4" />
            Upload advisory
          </Button>

          <Button onClick={() => navigate("/consultant/proposals")}
          >
            <FileSearch className="h-4 w-4" />
            Review proposals
          </Button>
          </>
        }
      />

      {/* ── KPI grid ── */}
      <KpiStrip
        items={[
          {
            label: "Pending proposal reviews",
            value: `${c.kpis.pendingReviews}`,
            icon: FileSearch,
            tone:
              c.kpis.pendingReviews > 0
                ? "warn"
                : "good",
          },
          {
            label: "Total proposals",
            value: `${c.kpis.totalProposals}`,
            icon: ClipboardList,
          },
          {
            label: "Active projects",
            value: `${c.kpis.activeProjects}`,
            icon: FolderKanban,
          },
          {
            label: "Advisory documents",
            value: `${c.kpis.advisoryDocuments}`,
            icon: FileCheck2,
          },
        ]}
      />

      {/* ── Main grid — proposal review queue + AI panel ── */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-lg">
                Awaiting your review
              </CardTitle>

              <p className="text-xs text-muted-foreground">
                {c.loading
                  ? "Loading…"
                  : `${c.proposalsAwaitingReviewCount} proposal${
                      c.proposalsAwaitingReviewCount === 1
                        ? ""
                        : "s"
                    } pending advisory review`}
              </p>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => navigate("/consultant/proposals")}
            >
              View all
              <ChevronRight className="h-4 w-4" />
            </Button>
          </CardHeader>

          <CardContent className="p-0">
            {c.loading ? (
              <div className="p-5 text-sm text-muted-foreground">
                Loading proposals…
              </div>
            ) : c.proposalsAwaitingReviewCount === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No proposals are currently awaiting your review.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border bg-muted/40 text-left text-overline font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-5 py-2.5 font-medium">
                        Proposal
                      </th>

                      <th className="px-3 py-2.5 font-medium">
                        Project
                      </th>

                      <th className="px-3 py-2.5 font-medium">
                        Submitted by
                      </th>

                      <th className="px-5 py-2.5 font-medium">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {c.proposalsAwaitingReview
                      .slice(0, 5)
                      .map(
                        (
                          p: (typeof c.proposalsAwaitingReview)[number],
                        ) => (
                          <tr
                            key={p.id}
                            className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/30"
                            onClick={() =>
                              navigate("/consultant/proposals")
                            }
                          >
                            <td className="px-5 py-3.5">
                              <div className="font-medium leading-tight">
                                {p.title}
                              </div>

                              <div className="font-mono text-xs text-muted-foreground">
                                {p.proposalId}
                              </div>
                            </td>

                            <td className="px-3 py-3.5 text-sm text-muted-foreground">
                              {p.projectCode}
                            </td>

                            <td className="px-3 py-3.5 text-xs text-muted-foreground">
                              {p.submittedBy}
                            </td>

                            <td className="px-5 py-3.5">
                              <StatusBadge status={p.status} />
                            </td>
                          </tr>
                        ),
                      )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ai-signals E3: the old "AI validation insights" ComingSoonCard
            here (permanently hidden behind FEATURES.aiPlaceholders) is now
            redundant — the WaitingOnYouCard below already surfaces
            warn/critical advisory signals (Sparkles-badged "AI" items from
            GET /api/lifecycle/my-actions) for this consultant's projects,
            so no second placeholder-turned-summary card is needed here. */}
      </section>

      {/* ── Bottom row — approvals + recently reviewed ── */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">
                Recently reviewed
              </CardTitle>
            </CardHeader>

            <CardContent className="p-0">
              {c.loading ? (
                <div className="p-5 text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : c.recentlyReviewed.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No proposals have been reviewed yet.
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {c.recentlyReviewed.map(
                    (
                      p: (typeof c.recentlyReviewed)[number],
                    ) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-5 py-3.5"
                      >
                        <div>
                          <div className="text-sm font-medium leading-tight">
                            {p.title}
                          </div>

                          <div className="text-xs text-muted-foreground">
                            {p.projectCode}
                          </div>
                        </div>

                        <StatusBadge status={p.status} />
                      </div>
                    ),
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* K1: was a "not built yet" placeholder for exactly this — cross-project
            workflow stages and gate checks waiting on this consultant. */}
        <WaitingOnYouCard />
      </section>

      {/* ── Footer status ── */}
      <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        Live advisory data
        {c.loading ? " · loading…" : ""}
      </div>
    </div>
  );
}

ConsultantDashboardPage.displayName =
  "ConsultantDashboardPage";