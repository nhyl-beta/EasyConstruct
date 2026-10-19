import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { CHART_AXIS_STYLE, CHART_GRID_STYLE } from "@/features/finance/budgets/constants/chart-colors";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export interface CashFlowDatum {
  month: string;
  inflow: number;
  outflow: number;
}

interface CashFlowChartProps {
  data: CashFlowDatum[];
  formatValue: (value: number) => string;
  ariaLabel: string;
}

// Inflow vs outflow. The lines draw in on load, hovering shows a crosshair, an
// active dot on each line and the shared tooltip. Outflow uses the destructive
// token and inflow chart-1; the tooltip and axis give the figures, so the two
// are told apart by name and value as well as by colour.
export function CashFlowChart({ data, formatValue, ariaLabel }: CashFlowChartProps) {
  const reduced = useReducedMotion();
  const label = `${ariaLabel}. ${data
    .map((d) => `${d.month}: inflow ${formatValue(d.inflow)}, outflow ${formatValue(d.outflow)}`)
    .join("; ")}.`;

  return (
    <div className="h-64" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cash-in" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="cash-out" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--destructive)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--destructive)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid {...CHART_GRID_STYLE} vertical={false} />
          <XAxis dataKey="month" {...CHART_AXIS_STYLE} />
          <YAxis {...CHART_AXIS_STYLE} tickFormatter={(v) => formatValue(Number(v))} />
          <Tooltip
            cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
            content={<ChartTooltip formatValue={formatValue} />}
          />
          <Area
            type="monotone"
            dataKey="inflow"
            name="Inflow"
            stroke="var(--chart-1)"
            fill="url(#cash-in)"
            strokeWidth={2}
            activeDot={{ r: 5 }}
            isAnimationActive={!reduced}
            animationDuration={900}
          />
          <Area
            type="monotone"
            dataKey="outflow"
            name="Outflow"
            stroke="var(--destructive)"
            fill="url(#cash-out)"
            strokeWidth={2}
            activeDot={{ r: 5 }}
            isAnimationActive={!reduced}
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
