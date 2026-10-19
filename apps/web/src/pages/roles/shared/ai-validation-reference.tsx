// Part B: "AI Validation Reference" — a real page answering "what
// AI-validation rules exist, what do they check, where do they show up",
// sourced from real config/code at render time via GET /ai-validation/config
// (apps/api/src/config/signals.ts's SIGNAL_THRESHOLDS/SIMILARITY_FLOOR/
// REFERENCE_CACHE_TTL_MS + the live reference-catalog count/freshness) —
// not hand-typed prose that goes stale. This is a genuinely new route,
// distinct from the dead, permanently-hidden "AI Insights" nav entry/route
// (FEATURES.aiPlaceholders) — never resurrected.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/services/api.client";
import { ProjectRepository } from "@/features/projects/repositories/project.repository";

interface AiValidationConfig {
  aiEnabled: boolean;
  signalThresholds: {
    costVariance: { warnPct: number; criticalPct: number };
    cumulativeChange: { warnPct: number; criticalPct: number };
    burnVsProgress: { warnPoints: number; criticalPoints: number };
    issueRecurrence: { warnCount: number; criticalCount: number; windowDays: number };
    stalledStage: { warnHours: number; criticalHours: number };
  };
  similarityFloor: number;
  referenceCacheTtlMs: number;
  referenceCatalog: { totalItems: number; lastFetchedAt: string | null };
}

function pct(n: number) {
  return `${Math.round(n * 1000) / 10}%`;
}

// A "see it live" link that resolves a demo project's real *code* (not a
// numeric id that shifts on re-seed — see demo-and-ux-progress.md A5) to
// its detail page, so the link works even after demo-seed-stages.ts is
// re-run. Reuses the same ProjectRepository.getById(idOrCode) fallback the
// detail page itself uses — no new lookup path.
function DemoLink({ code, children }: { code: string; children: React.ReactNode }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const go = async () => {
    setStatus("loading");
    const project = await ProjectRepository.getById(code).catch(() => null);
    if (project) {
      navigate(`/projects/${project.id}`);
    } else {
      setStatus("error");
    }
  };
  return (
    <span>
      <button type="button" onClick={go} className="text-primary-strong hover:underline">
        {children}
      </button>
      {status === "error" && (
        <span className="ml-1 text-xs text-destructive-strong">
          (not found — re-run `npm run demo:seed`/`demo:ai-signals`)
        </span>
      )}
    </span>
  );
}

function RuleCard({
  title,
  stage,
  children,
  demo,
}: {
  title: string;
  stage: string;
  children: React.ReactNode;
  demo: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <Badge variant="outline" className="rounded-full text-overline">{stage}</Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        {children}
        <p className="pt-1 text-xs">See it live: {demo}</p>
      </CardContent>
    </Card>
  );
}

export default function AiValidationReferencePage() {
  const [config, setConfig] = useState<AiValidationConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get("/ai-validation/config")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((json: any) => setConfig(json.data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load."));
  }, []);

  return (
    <PageContainer>
      <PageHeader
        title="AI Validation Reference"
        description="What every real AI-validation rule in this app checks, its real thresholds, and where to see it fire live — generated from server/src/config/signals.ts and the rule code itself, not hand-typed prose."
      />
      <PageContent className="space-y-6 p-4 md:p-8">
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-strong">
            {error}
          </div>
        )}
        {!config && !error && (
          <p className="text-sm text-muted-foreground">Loading real configuration…</p>
        )}
        {config && (
          <>
            <Card className="border-ai/30 bg-ai/5">
              <CardContent className="flex flex-wrap items-center gap-4 p-4 text-sm">
                <Badge variant="outline" className="rounded-full border-ai/40 text-ai">AI</Badge>
                <span>
                  <strong>FEATURES.ai</strong> is currently{" "}
                  <strong>{config.aiEnabled ? "ON" : "OFF"}</strong> on this server.
                </span>
                <span>
                  Cost-reference catalog: <strong>{config.referenceCatalog.totalItems}</strong>{" "}
                  cached items, last fetched{" "}
                  {config.referenceCatalog.lastFetchedAt
                    ? new Date(config.referenceCatalog.lastFetchedAt).toLocaleString()
                    : "never"}
                  .
                </span>
              </CardContent>
            </Card>

            <section className="space-y-3">
              <h3 className="text-lg font-semibold">1. Proposal completeness check</h3>
              <RuleCard
                title="Rule-based proposal validation"
                stage="Proposal"
                demo={<DemoLink code="DEMO-S1">DEMO · 1 Proposal</DemoLink>}
              >
                <p>
                  Runs on every proposal create/submit (<code>proposals/validation.ts
                  validateProposal()</code>) — deterministic, no external AI call. Checks: title
                  present and ≥5 characters; project code resolves to a real project; description
                  present and ≥20 characters (warning only); estimated amount present and
                  numeric (warning only). A failing check (missing title, unknown project)
                  blocks; warnings never block — a human reviewer always makes the actual call.
                </p>
              </RuleCard>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-semibold">2. Cost-comparison engine (EstimationPro.ai)</h3>
              <RuleCard
                title="Line-item cost comparison"
                stage="Construction (Budget Change Request / Change Order Request)"
                demo={<DemoLink code="DEMO-S4">DEMO · 4 Construction</DemoLink>}
              >
                <p>
                  Every line item with a quantity and unit is matched against the cached
                  EstimationPro.ai catalog by <strong>Dice-coefficient token similarity</strong>{" "}
                  (<code>matcher.ts bestMatch</code>); a match below the similarity floor is
                  discarded as no comparable reference. The current similarity floor is{" "}
                  <strong>{config.similarityFloor}</strong> (0.40 = a match needs at least 40%
                  token overlap). Matched items are converted to a common unit and compared
                  against the reference low/typical/high band (converted to PHP at the
                  configured FX rate) to produce one of four verdicts:
                  <strong> within-range</strong> (near the typical value),{" "}
                  <strong>above-typical</strong> / <strong>below-typical</strong> (outside the
                  band), or <strong>no-match</strong> (no quantity, no unit, no catalog match, or
                  unconvertible units — shown with no range, never a fabricated one). The
                  reference catalog is cached and refreshed lazily; the current cache TTL is{" "}
                  <strong>{(config.referenceCacheTtlMs / (24 * 60 * 60 * 1000)).toFixed(0)} days</strong>{" "}
                  (7 days = <code>REFERENCE_CACHE_TTL_MS</code>).
                </p>
              </RuleCard>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-semibold">3. Decision-support signals (5 rules)</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <RuleCard
                  title="cost-variance"
                  stage="Construction"
                  demo={<DemoLink code="DEMO-S4">DEMO · 4 Construction (signals)</DemoLink>}
                >
                  <p>
                    Fires when a workflow line item's cost-comparison verdict is above/below
                    typical, on a workflow that's active or finished within 30 days. Warn at{" "}
                    <strong>{pct(config.signalThresholds.costVariance.warnPct)}</strong> variance,
                    critical at <strong>{pct(config.signalThresholds.costVariance.criticalPct)}</strong>.
                  </p>
                </RuleCard>
                <RuleCard
                  title="cumulative-change-impact"
                  stage="Construction"
                  demo={<DemoLink code="DEMO-S4">DEMO · 4 Construction (signals)</DemoLink>}
                >
                  <p>
                    Sums every approved budget change against the project's original contract
                    value. Warn at{" "}
                    <strong>{pct(config.signalThresholds.cumulativeChange.warnPct)}</strong>{" "}
                    cumulative increase, critical at{" "}
                    <strong>{pct(config.signalThresholds.cumulativeChange.criticalPct)}</strong>.
                  </p>
                </RuleCard>
                <RuleCard
                  title="burn-vs-progress"
                  stage="Construction"
                  demo={<DemoLink code="DEMO-S4">DEMO · 4 Construction (signals)</DemoLink>}
                >
                  <p>
                    Compares real task-completion percentage (not the lifecycle's own
                    `progress`, which has a Construction-band offset) against approved-spend
                    percentage of budget. Warn at a{" "}
                    <strong>{config.signalThresholds.burnVsProgress.warnPoints}-point</strong>{" "}
                    gap, critical at{" "}
                    <strong>{config.signalThresholds.burnVsProgress.criticalPoints} points</strong>.
                  </p>
                </RuleCard>
                <RuleCard
                  title="issue-recurrence"
                  stage="Construction"
                  demo={<DemoLink code="DEMO-S4">DEMO · 4 Construction (signals)</DemoLink>}
                >
                  <p>
                    Groups open issues by category within a{" "}
                    <strong>{config.signalThresholds.issueRecurrence.windowDays}-day</strong>{" "}
                    window. Warn at{" "}
                    <strong>{config.signalThresholds.issueRecurrence.warnCount}</strong>{" "}
                    recurrences in that category, critical at{" "}
                    <strong>{config.signalThresholds.issueRecurrence.criticalCount}</strong>. Also
                    cites a resolved precedent from any project with a matching category, if one
                    exists.
                  </p>
                </RuleCard>
                <RuleCard
                  title="stalled-stage"
                  stage="Any (whichever role owns the stalled workflow stage)"
                  demo={<DemoLink code="DEMO-S4">DEMO · 4 Construction (signals)</DemoLink>}
                >
                  <p>
                    Fires when a workflow's current stage has sat un-decided for longer than a
                    threshold. Warn at{" "}
                    <strong>{config.signalThresholds.stalledStage.warnHours}h</strong>, critical
                    at <strong>{config.signalThresholds.stalledStage.criticalHours}h</strong>. A
                    revision-required stage is attributed to the role that must fix it (the
                    initiator), not the reviewer who sent it back.
                  </p>
                </RuleCard>
              </div>
              <p className="text-xs text-muted-foreground">
                All five are rule-based advisories — they never block a gate or an approval. They
                render in every project's Decision Support section (below the lifecycle gate
                checklist, on <code>/projects/:id</code>) and, when warn/critical, on every role's
                "Waiting on you" dashboard card with a Sparkles/"AI" badge.
              </p>
            </section>

            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Refresh live values
              </Button>
            </div>
          </>
        )}
      </PageContent>
    </PageContainer>
  );
}

AiValidationReferencePage.displayName = "AiValidationReferencePage";
