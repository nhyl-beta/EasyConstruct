import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { Slice } from "@/lib/group-top-n";
import { cn } from "@/lib/utils";

// Token colours only. The sixth slice is a softened chart-1 so no colour is
// reused; the legend carries the numbers, so meaning is never colour alone.
const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-2)",
  "var(--chart-5)",
  "color-mix(in oklch, var(--chart-1) 45%, var(--card))",
];
const OTHER_COLOR = "var(--muted-foreground)";

interface DonutChartProps {
  data: Slice[];
  /** Name of the folded-in slice, drawn in the muted colour. */
  otherLabel?: string;
  formatValue: (value: number) => string;
  /** Caption under the total in the centre, e.g. "Total planned". */
  centerCaption: string;
  /** What the chart is, for the accessible name. */
  ariaLabel: string;
  emptyText: string;
  className?: string;
}

export function DonutChart({
  data,
  otherLabel = "Other",
  formatValue,
  centerCaption,
  ariaLabel,
  emptyText,
  className,
}: DonutChartProps) {
  const reduced = useReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0 || total <= 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  const colorFor = (slice: Slice, i: number) =>
    slice.name === otherLabel ? OTHER_COLOR : SLICE_COLORS[i % SLICE_COLORS.length];
  const percent = (value: number) => `${((value / total) * 100).toFixed(1)}%`;
  const shown = active !== null ? data[active] : null;

  // The hovered slice grows a little; with reduced motion it just stays put.
  const renderActive = (props: PieSectorDataItem) => (
    <Sector {...props} outerRadius={(props.outerRadius ?? 0) + (reduced ? 0 : 6)} />
  );

  const summary = `${ariaLabel}. Total ${formatValue(total)}. ${data
    .map((d) => `${d.name} ${formatValue(d.value)}, ${percent(d.value)}`)
    .join("; ")}.`;

  return (
    <div className={className}>
      <div className="relative h-56" role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={54}
              outerRadius={80}
              paddingAngle={2}
              stroke="var(--card)"
              isAnimationActive={!reduced}
              animationDuration={900}
              activeIndex={active ?? undefined}
              activeShape={renderActive}
              onMouseEnter={(_, i) => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((slice, i) => (
                <Cell
                  key={slice.name}
                  fill={colorFor(slice, i)}
                  fillOpacity={active === null || active === i ? 1 : 0.35}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-14 text-center"
        >
          {shown ? (
            <>
              <span className="max-w-full truncate text-xs text-muted-foreground">{shown.name}</span>
              <span className="text-base font-semibold tabular-nums">{formatValue(shown.value)}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{percent(shown.value)}</span>
            </>
          ) : (
            <>
              <span className="text-base font-semibold tabular-nums">{formatValue(total)}</span>
              <span className="text-xs text-muted-foreground">{centerCaption}</span>
            </>
          )}
        </div>
      </div>

      <ul className="mt-2 grid grid-cols-1 gap-0.5 text-xs sm:grid-cols-2">
        {data.map((slice, i) => (
          <li
            key={slice.name}
            tabIndex={0}
            aria-label={`${slice.name}: ${formatValue(slice.value)}, ${percent(slice.value)}`}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-1.5 py-1 outline-none transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              active === i && "bg-muted",
            )}
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: colorFor(slice, i) }}
            />
            <span className="min-w-0 flex-1 truncate">{slice.name}</span>
            <span className="tabular-nums text-muted-foreground">{formatValue(slice.value)}</span>
            <span className="w-11 text-right tabular-nums">{percent(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
