// What approving a budget change or change order would do (objectives fix 3.2).
// Read-only: it never approves, rejects or applies anything.
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DecisionSupportLabel } from "@/components/shared/decision-support-label";
import { FEATURES } from "@/config/features";
import { formatCurrency } from "@/lib/format-currency";
import { WorkflowForecastRepository, type WorkflowImpactForecast } from "../repositories/workflow.repository";

const SEVERITY_VARIANT = { info: "info", warn: "warning", critical: "danger" } as const;
const SEVERITY_LABEL = { info: "Low impact", warn: "Needs a look", critical: "High impact" } as const;

export function ImpactForecastCard({ workflowId }: { workflowId: number }) {
  const [days, setDays] = useState("0");
  const [data, setData] = useState<WorkflowImpactForecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number.parseInt(days, 10);
  const timeImpactDays = Number.isFinite(parsed) ? parsed : 0;

  useEffect(() => {
    if (!FEATURES.ai) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      WorkflowForecastRepository.get(workflowId, timeImpactDays)
        .then((res) => {
          if (cancelled) return;
          setData(res);
          setError(null);
        })
        .catch((e) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load the forecast");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [workflowId, timeImpactDays]);

  if (!FEATURES.ai) return null;
  // Not a cost change (for example a design approval): nothing to forecast.
  if (data && !data.applicable) return null;

  return (
    <section className="space-y-2 rounded-xl border border-border/60 p-4" aria-label="Impact forecast">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Impact forecast</h3>
        <DecisionSupportLabel />
      </div>

      {loading && !data ? (
        <p className="text-sm text-muted-foreground">Working out the impact…</p>
      ) : error ? (
        <p className="text-sm text-destructive-strong">Couldn't load the forecast. {error}</p>
      ) : data && data.applicable ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={SEVERITY_VARIANT[data.forecast.severity]}>{SEVERITY_LABEL[data.forecast.severity]}</Badge>
            <p className="text-sm font-medium">{data.forecast.sentence}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Budget after change</dt>
              <dd className="tabular-nums">{formatCurrency(data.forecast.newTotal)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Contract value</dt>
              <dd className="tabular-nums">
                {data.forecast.contractValue != null ? formatCurrency(data.forecast.contractValue) : "None on file"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Task completion</dt>
              <dd className="tabular-nums">
                {data.forecast.completionPct != null ? `${data.forecast.completionPct}%` : "No tasks yet"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Projected overrun</dt>
              <dd className="tabular-nums">
                {data.forecast.projectedOverrun == null
                  ? "Not available yet"
                  : data.forecast.projectedOverrun > 0
                    ? formatCurrency(data.forecast.projectedOverrun)
                    : "None projected"}
              </dd>
            </div>
          </dl>

          <div className="flex items-center gap-2">
            <Label htmlFor={`slip-${workflowId}`} className="text-xs text-muted-foreground">
              What if the schedule slips by (days)
            </Label>
            <Input
              id={`slip-${workflowId}`}
              type="number"
              inputMode="numeric"
              className="h-7 w-20"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>

          {data.forecast.movedMilestones.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {data.forecast.movedMilestones.map((m) => (
                <li key={m.id}>
                  {m.title}: {m.from} to {m.to}
                </li>
              ))}
            </ul>
          )}

          <ul className="space-y-0.5 text-overline text-muted-foreground">
            {data.forecast.basis.map((b) => (
              <li key={b}>{b}</li>
            ))}
            {data.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
