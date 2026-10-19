import { useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { CHART_AXIS_STYLE, CHART_GRID_STYLE } from "@/features/finance/budgets/constants/chart-colors";
import type { Slice } from "@/lib/group-top-n";

interface BarShapeProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
}

interface AnimatedBarChartProps {
  data: Slice[];
  formatValue: (value: number) => string;
  formatAxis: (value: number) => string;
  /** What the chart is, for the accessible name. */
  ariaLabel: string;
  /** Shown instead of the chart when every value is zero. */
  emptyText: string;
}

// Bars grow from the baseline with a short stagger (CSS, see App.css, which
// also switches it off for prefers-reduced-motion). Hovering or focusing a bar
// highlights it and dims the others; every bar carries a value label, so the
// numbers never depend on colour or on hovering.
export function AnimatedBarChart({ data, formatValue, formatAxis, ariaLabel, emptyText }: AnimatedBarChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0 || total <= 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  const largest = data.reduce((best, d) => (d.value > best.value ? d : best), data[0]);
  const summary = `Total ${formatValue(total)}. Largest: ${largest.name}, ${formatValue(largest.value)} (${(
    (largest.value / total) *
    100
  ).toFixed(0)}%).`;
  const label = `${ariaLabel}. ${summary} ${data.map((d) => `${d.name} ${formatValue(d.value)}`).join("; ")}.`;

  const renderBar = (props: BarShapeProps) => {
    const { x, y, width, height, index } = props;
    const d = data[index];
    if (!d) return <g />;
    const isLargest = d.name === largest.name;
    return (
      <g
        tabIndex={0}
        role="img"
        aria-label={`${d.name}: ${formatValue(d.value)}`}
        onMouseEnter={() => setActive(index)}
        onMouseLeave={() => setActive(null)}
        onFocus={() => setActive(index)}
        onBlur={() => setActive(null)}
        className="outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {height > 0 && (
          <rect
            className="chart-bar-grow"
            x={x}
            y={y}
            width={width}
            height={height}
            rx={6}
            fill={isLargest ? "var(--chart-1)" : "var(--chart-3)"}
            fillOpacity={active === null || active === index ? 1 : 0.35}
            style={{ animationDelay: `${index * 70}ms` }}
          />
        )}
      </g>
    );
  };

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">
        Total <span className="font-medium tabular-nums text-foreground">{formatValue(total)}</span> · largest{" "}
        <span className="font-medium text-foreground">{largest.name}</span>{" "}
        <span className="tabular-nums">({((largest.value / total) * 100).toFixed(0)}%)</span>
      </p>
      <div className="h-52" role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...CHART_GRID_STYLE} vertical={false} />
            <XAxis dataKey="name" {...CHART_AXIS_STYLE} />
            <YAxis {...CHART_AXIS_STYLE} tickFormatter={(v) => formatAxis(Number(v))} />
            <Tooltip cursor={false} content={<ChartTooltip formatValue={formatValue} total={total} />} />
            <Bar
              dataKey="value"
              name="Spend"
              isAnimationActive={false}
              shape={(props: unknown) => renderBar(props as BarShapeProps)}
            >
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v: number) => formatAxis(Number(v))}
                fill="var(--foreground)"
                style={{ fontSize: 10, fontVariantNumeric: "tabular-nums" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
