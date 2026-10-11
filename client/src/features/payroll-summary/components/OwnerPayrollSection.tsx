// Owner dashboard: read-only payroll summary. Aggregates of approved payroll
// only — no employee names, ids or pay lines exist in the data it renders.
import type { ReactNode } from "react";
import { Banknote, Clock, FileCheck2, Timer, Undo2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { KpiStrip, type KpiItem } from "@/components/ui/kpi-strip";
import { Progress } from "@/components/ui/progress";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusTone } from "@/config/status-tone";
import {
  formatAxisCurrency,
  formatCompactCurrency,
  formatCurrency,
} from "@/lib/format-currency";
import { OWNER_TREND_MONTHS } from "../hooks/usePayrollSummary";
import type {
  AttentionSeverity,
  PayrollSummary,
  PipelineStage,
} from "../types/payroll-summary.types";

interface OwnerPayrollSectionProps {
  summary: PayrollSummary | null;
  loading: boolean;
  error: Error | null;
}

const BASIS = "Approved batches only";
const WINDOW = `Last ${OWNER_TREND_MONTHS} months`;

const severityTone: Record<AttentionSeverity, StatusTone> = {
  critical: "danger",
  warning: "warning",
  info: "info",
};
const severityLabel: Record<AttentionSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

const shortDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// Each card renders its own loading / error / empty state, so one failing
// card never blanks the rest of the dashboard.
function CardState({
  loading,
  error,
  empty = false,
  emptyText = "",
  children,
}: {
  loading: boolean;
  error: Error | null;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
}) {
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (error) {
    return (
      <p className="text-sm text-destructive-strong">
        Couldn't load payroll figures. {error.message}
      </p>
    );
  }
  if (empty) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return <>{children}</>;
}

function RankedBars({
  rows,
}: {
  rows: { key: string; label: string; laborCost: number; share: number }[];
}) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {formatCompactCurrency(r.laborCost)} · {r.share.toFixed(1)}%
            </span>
          </div>
          <Progress
            value={r.share}
            className="mt-1 h-1.5"
            aria-label={`${r.label}: ${r.share.toFixed(1)}% of labor cost`}
          />
        </li>
      ))}
    </ul>
  );
}

function PipelineRow({ label, stage, hint }: { label: string; stage: PipelineStage; hint?: string }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums">
          {stage.count} {plural(stage.count, "batch", "batches")}
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">{formatCurrency(stage.amount)}</p>
      </div>
    </li>
  );
}

function ShareRow({ label, employee, employer }: { label: string; employee: number; employer: number }) {
  const total = employee + employer;
  const employeePct = total > 0 ? (employee / total) * 100 : 0;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{formatCompactCurrency(total)}</span>
      </div>
      <Progress
        value={employeePct}
        className="mt-1 h-1.5"
        aria-label={`${label}: employee share ${employeePct.toFixed(0)}%`}
      />
      <div className="mt-1 flex justify-between text-xs tabular-nums text-muted-foreground">
        <span>Employee {formatCompactCurrency(employee)}</span>
        <span>Employer {formatCompactCurrency(employer)}</span>
      </div>
    </li>
  );
}

function kpiItems(summary: PayrollSummary): KpiItem[] {
  const { latest, pipeline, attention } = summary;
  const pct = latest?.vsPreviousPct ?? null;
  const flat = pct !== null && Math.abs(pct) < 0.05;
  const overdue = attention.some((a) => a.kind === "pending_too_long");
  const days = pipeline.pending.oldestDays;

  return [
    {
      label: "Labor cost",
      value: latest ? formatCompactCurrency(latest.laborCost) : "—",
      icon: Banknote,
      hint: latest ? `${latest.period} · ${BASIS.toLowerCase()}` : "No approved payroll yet",
      // A cost going up is the unwelcome direction.
      delta:
        pct === null
          ? undefined
          : {
              direction: flat ? "flat" : pct > 0 ? "up" : "down",
              tone: flat ? "neutral" : pct > 0 ? "bad" : "good",
              value: flat ? undefined : `${Math.abs(pct).toFixed(1)}%`,
              label: "vs previous period",
            },
    },
    {
      label: "Awaiting approval",
      value: `${pipeline.pending.count}`,
      icon: Clock,
      tone: overdue ? "warn" : "neutral",
      hint:
        pipeline.pending.count > 0
          ? `${formatCompactCurrency(pipeline.pending.amount)} · oldest ${days} ${plural(days, "day", "days")}`
          : "Nothing pending with Finance",
    },
    {
      label: "Revision required",
      value: `${pipeline.revisionRequired.count}`,
      icon: Undo2,
      tone: pipeline.revisionRequired.count > 0 ? "warn" : "neutral",
      hint:
        pipeline.revisionRequired.count > 0
          ? `${formatCompactCurrency(pipeline.revisionRequired.amount)} waiting on HR`
          : "None waiting on HR",
    },
    {
      label: "Overtime hours",
      value: latest
        ? `${latest.overtimeHours.toLocaleString("en-PH", { maximumFractionDigits: 1 })} h`
        : "—",
      icon: Timer,
      hint: latest ? latest.period : "No approved payroll yet",
    },
  ];
}

export function OwnerPayrollSection({ summary, loading, error }: OwnerPayrollSectionProps) {
  const noApproved = !!summary && summary.totals.approvedBatches === 0;
  const noPayroll =
    noApproved &&
    summary.pipeline.draft.count +
      summary.pipeline.pending.count +
      summary.pipeline.revisionRequired.count ===
      0;
  const state = { loading, error };

  return (
    <section aria-label="Payroll summary" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Payroll</h2>
        <p className="text-xs text-muted-foreground">
          Read-only summary. {BASIS}: draft, pending and returned batches appear in the pipeline, never in cost.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : error || !summary ? (
        <SectionCard title="Payroll key figures">
          <CardState {...state}>{null}</CardState>
        </SectionCard>
      ) : (
        <KpiStrip items={kpiItems(summary)} />
      )}

      {noPayroll ? (
        <SectionCard title="No payroll yet">
          <p className="py-6 text-center text-sm text-muted-foreground">
            Payroll figures appear here once HR submits batches and Finance approves them.
          </p>
        </SectionCard>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <SectionCard
              title="Payroll cost trend"
              subtitle={`Labor cost per period · ${BASIS.toLowerCase()}`}
              badge={WINDOW}
              className="xl:col-span-2"
            >
              <CardState
                {...state}
                empty={!summary || summary.trend.length === 0}
                emptyText="No approved payroll in this window."
              >
                {summary && (
                  <div className="h-64" role="img" aria-label="Labor cost per approved payroll period">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.trend}>
                        <CartesianGrid stroke="var(--border)" strokeOpacity={0.5} vertical={false} />
                        <XAxis
                          dataKey="periodEnd"
                          tickFormatter={shortDate}
                          tick={{ fontSize: 11 }}
                          stroke="var(--muted-foreground)"
                        />
                        <YAxis
                          tick={{ fontSize: 11 }}
                          stroke="var(--muted-foreground)"
                          tickFormatter={(v) => formatAxisCurrency(Number(v))}
                          width={56}
                        />
                        <Tooltip
                          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                          content={({ active, payload }) => {
                            const p = active ? payload?.[0]?.payload : undefined;
                            if (!p) return null;
                            return (
                              <div className="rounded-md border border-border bg-popover p-3 text-xs shadow-md">
                                <p className="mb-1 font-medium">{p.label}</p>
                                <p className="tabular-nums">Labor cost {formatCurrency(p.laborCost)}</p>
                                <p className="tabular-nums text-muted-foreground">Gross {formatCurrency(p.gross)}</p>
                                <p className="tabular-nums text-muted-foreground">Net {formatCurrency(p.net)}</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="laborCost" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardState>
            </SectionCard>

            <SectionCard title="Pipeline" subtitle="Amounts are the employer cost of each batch">
              <CardState {...state}>
                {summary && (
                  <ul className="space-y-3">
                    <PipelineRow label="Draft" stage={summary.pipeline.draft} hint="HR still building" />
                    <PipelineRow
                      label="Pending approval"
                      stage={summary.pipeline.pending}
                      hint={
                        summary.pipeline.pending.count
                          ? `Oldest ${summary.pipeline.pending.oldestDays} ${plural(summary.pipeline.pending.oldestDays, "day", "days")} with Finance`
                          : "With Finance"
                      }
                    />
                    <PipelineRow label="Revision required" stage={summary.pipeline.revisionRequired} hint="Sent back to HR" />
                    <PipelineRow label="Approved this month" stage={summary.pipeline.approvedThisMonth} />
                  </ul>
                )}
              </CardState>
            </SectionCard>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <SectionCard
              title="Where the money goes"
              subtitle={`Share of labor cost, all approved payroll · ${BASIS.toLowerCase()}`}
              className="xl:col-span-2"
            >
              <CardState {...state} empty={noApproved} emptyText="No approved payroll yet.">
                {summary && (
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                    <div>
                      <p className="mb-3 text-overline font-medium uppercase tracking-wider text-muted-foreground">
                        Top projects
                      </p>
                      <RankedBars
                        rows={summary.byProject.map((p) => ({
                          key: p.projectCode,
                          label: p.projectName,
                          laborCost: p.laborCost,
                          share: p.share,
                        }))}
                      />
                    </div>
                    <div>
                      <p className="mb-3 text-overline font-medium uppercase tracking-wider text-muted-foreground">
                        Top groups
                      </p>
                      <RankedBars
                        rows={summary.byGroup.map((g) => ({
                          key: g.group,
                          label: g.group,
                          laborCost: g.laborCost,
                          share: g.share,
                        }))}
                      />
                    </div>
                  </div>
                )}
              </CardState>
            </SectionCard>

            <SectionCard title="Statutory contributions" subtitle={`${WINDOW} · ${BASIS.toLowerCase()}`}>
              <CardState {...state} empty={noApproved} emptyText="No approved payroll yet.">
                {summary && (
                  <div className="space-y-4">
                    <ul className="space-y-4">
                      <ShareRow label="SSS" {...summary.statutory.sss} />
                      <ShareRow label="PhilHealth" {...summary.statutory.philhealth} />
                      <ShareRow label="Pag-IBIG" {...summary.statutory.pagibig} />
                    </ul>
                    <dl className="space-y-1 border-t border-border pt-3 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Employer EC</dt>
                        <dd className="tabular-nums">{formatCurrency(summary.statutory.ec)}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </CardState>
            </SectionCard>
          </section>

          <SectionCard title="Payroll needing attention" subtitle="Rules checked on every load">
            <CardState {...state}>
              {summary &&
                (summary.attention.length === 0 ? (
                  <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                    <FileCheck2 className="h-4 w-4" aria-hidden /> Nothing needs attention
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {summary.attention.map((a, i) => (
                      <li
                        key={`${a.kind}-${a.batchId ?? i}`}
                        className="flex items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                      >
                        <StatusBadge
                          status={severityLabel[a.severity]}
                          tone={severityTone[a.severity]}
                          className="mt-0.5 shrink-0"
                        />
                        <p className="text-sm">{a.message}</p>
                      </li>
                    ))}
                  </ul>
                ))}
            </CardState>
          </SectionCard>
        </>
      )}
    </section>
  );
}
