// apps/web/src/pages/finance/finance-ai-review.tsx
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SectionCard } from "@/components/ui/section-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFinanceAiInsightsController } from "@/features/finance/hooks/use-finance-ai-insight";
import { ShieldAlert, Sparkles } from "lucide-react";

export default function FinanceAiReviewPage() {
  const c = useFinanceAiInsightsController();

  return (
    <PageContainer>
      <PageHeader
        title="Financial Intelligence"
        description="AI-powered forecasting, anomaly detection and risk advisory. Advisory only — humans approve all decisions."
      />
      <PageContent className="space-y-6 p-4 md:p-8">
        {c.error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-strong">
            Failed to load insights: {c.error}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {c.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-40 animate-pulse rounded-2xl bg-muted/40"
              />
            ))
          ) : c.insights.length === 0 ? (
            <div className="col-span-2 rounded-xl border p-6 text-center text-sm text-muted-foreground">
              No active AI insights right now.
            </div>
          ) : (
            c.insights.map((i) => (
              <Card key={i.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-overline uppercase tracking-wide text-primary-strong">
                      <Sparkles className="h-3 w-3" /> {i.category}
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-full text-overline"
                    >
                      {(i.confidence * 100).toFixed(0)}% confidence
                    </Badge>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{i.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {i.body}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="text-overline uppercase tracking-wide text-muted-foreground">
                      Confidence
                    </div>
                    <Progress value={i.confidence * 100} className="h-1.5" />
                  </div>
                  <div>
                    <div className="mb-1 text-overline uppercase tracking-wide text-muted-foreground">
                      Impact
                    </div>
                    <p className="text-xs text-muted-foreground">{i.impact}</p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => c.acknowledge(i.id)}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => c.dismiss(i.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <SectionCard
          title="Financial risk register"
          subtitle="AI-detected exposures"
          badge={`${c.risks.length}`}
        >
          <ul className="space-y-2">
            {c.risks.map((r) => (
              <li
                key={r.id}
                className="flex items-start gap-3 rounded-xl border p-3"
              >
                <ShieldAlert
                  className={`mt-0.5 h-4 w-4 ${
                    r.level === "critical"
                      ? "text-destructive-strong"
                      : r.level === "high"
                      ? "text-warning-strong"
                      : "text-success-strong"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{r.title}</div>
                    <StatusBadge status={r.level} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.impact} · {r.project}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </PageContent>
    </PageContainer>
  );
}

FinanceAiReviewPage.displayName = "FinanceAiReviewPage";
