import * as React from "react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Two columns on phones, four from `lg`. Pass `cols={3}` for a three-up row. */
export function KpiGrid({
  children,
  className,
  cols = 4,
}: {
  children: React.ReactNode;
  className?: string;
  cols?: 2 | 3 | 4;
}) {
  return (
    <div
      data-slot="kpi-grid"
      className={cn(
        "grid min-w-0 grid-cols-2 gap-3",
        cols === 3 && "lg:grid-cols-3",
        cols === 4 && "lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A single KPI tile. The value scales down on phones and never overflows its card. */
export function KpiCard({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardContent className="min-w-0 space-y-1 p-3 sm:p-4">
        <div className="truncate text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={cn("truncate text-xl font-semibold tabular-nums sm:text-2xl", tone)}>{value}</div>
        {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
