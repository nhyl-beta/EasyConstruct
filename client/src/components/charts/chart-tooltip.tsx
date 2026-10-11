import type { TooltipProps } from "recharts";

type ChartTooltipProps = TooltipProps<number, string> & {
  formatValue: (value: number) => string;
  /** When given, each row also shows its share of this total. */
  total?: number;
};

// The one tooltip for every chart: card colours, border and radius from the
// design tokens, tabular figures. Recharts injects active / payload / label.
export function ChartTooltip({ active, payload, label, formatValue, total }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label !== undefined && label !== "" && <p className="mb-1 font-medium">{String(label)}</p>}
      <ul className="space-y-0.5">
        {payload.map((row, i) => {
          const value = Number(row.value ?? 0);
          const share = total && total > 0 ? ` · ${((value / total) * 100).toFixed(1)}%` : "";
          return (
            <li key={`${row.name}-${i}`} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: row.color ?? row.payload?.fill }}
              />
              <span className="text-muted-foreground">{row.name}</span>
              <span className="ml-auto pl-3 font-medium tabular-nums">
                {formatValue(value)}
                {share}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
