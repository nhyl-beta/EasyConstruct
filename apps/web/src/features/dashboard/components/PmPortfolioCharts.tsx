// apps/web/src/features/dashboard/components/PmPortfolioCharts.tsx
//
// PM dashboard charts: how the portfolio splits across lifecycle phases
// (donut) and where the open work sits (bar: open tasks per project). Both are
// computed from data the dashboard already has access to (own projects, own
// tasks) — nothing new on the server.
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { SectionCard } from "@/components/ui/section-card";

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
];

// Both charts are drawn from the dashboard summary the server computed (the
// split of the PM's own projects by phase, and open tasks per project), so this
// component no longer downloads the project and task lists to count them.
export interface PhaseSlice {
  name: string;
  value: number;
}
export interface WorkloadBar {
  project: string;
  pending: number;
  inProgress: number;
}

export function PmPortfolioCharts({
  phases: byPhase,
  workload,
  loading,
}: {
  phases: PhaseSlice[];
  workload: WorkloadBar[];
  loading: boolean;
}) {
  const tasks = { loading };
  const reduced = useReducedMotion();

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <SectionCard title="Projects by phase" subtitle="Where your portfolio sits in the lifecycle">
        {byPhase.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <div className="h-48 w-48 shrink-0" role="img" aria-label={`Projects by phase: ${byPhase.map((d) => `${d.name} ${d.value}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byPhase} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2} isAnimationActive={!reduced}>
                    {byPhase.map((d, i) => (
                      <Cell key={d.name} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip formatValue={(v) => String(v)} total={byPhase.reduce((s, d) => s + d.value, 0)} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-full space-y-1.5 text-sm">
              {byPhase.map((d, i) => (
                <li key={d.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden />
                  <span className="flex-1">{d.name}</span>
                  <span className="tabular-nums text-muted-foreground">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Open workload" subtitle="Unfinished tasks per project (top 8)">
        {tasks.loading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : workload.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No open tasks on your projects.</p>
        ) : (
          <div className="h-56" role="img" aria-label="Open tasks per project">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workload} margin={{ left: -16, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="project" tick={{ fontSize: 11 }} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltip formatValue={(v) => String(v)} />} />
                <Bar dataKey="inProgress" name="In progress" stackId="w" fill={PALETTE[0]} isAnimationActive={!reduced} />
                <Bar dataKey="pending" name="Pending" stackId="w" fill={PALETTE[2]} radius={[4, 4, 0, 0]} isAnimationActive={!reduced} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>
    </section>
  );
}
