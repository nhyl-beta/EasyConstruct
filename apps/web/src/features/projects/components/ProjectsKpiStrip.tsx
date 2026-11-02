import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** The risk filter value each card selects ("all" clears it). */
type RiskFilter = "all" | "low" | "medium" | "high";

interface Props {
  kpis: { total: number; onTrack: number; atRisk: number; delayed: number };
  /** Current risk filter; the matching card is highlighted. */
  activeRisk?: string;
  /** Clicking a card sets the risk filter. Omit for a read-only strip. */
  onSelect?: (risk: RiskFilter) => void;
}

export const ProjectsKpiStrip: React.FC<Props> = ({ kpis, activeRisk = "all", onSelect }) => {
  const items: { label: string; value: string; tone: string; risk: RiskFilter }[] = [
    { label: "Active", value: String(kpis.total), tone: "text-foreground", risk: "all" },
    { label: "On track", value: String(kpis.onTrack), tone: "text-success-strong", risk: "low" },
    // text-warning-strong, not text-warning-foreground — this renders directly on
    // the card background, not on a filled warning chip, and that token's
    // dark-mode value is nearly black, i.e. invisible here.
    { label: "At risk", value: String(kpis.atRisk), tone: "text-warning-strong", risk: "medium" },
    { label: "Delayed", value: String(kpis.delayed), tone: "text-destructive-strong", risk: "high" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((s) => {
        const selected = s.risk === activeRisk;
        const body = (
          <CardContent className="space-y-1 px-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
            <div className={`text-2xl font-semibold tabular-nums ${s.tone}`}>{s.value}</div>
          </CardContent>
        );
        return onSelect ? (
          <button
            key={s.label}
            type="button"
            aria-pressed={selected}
            aria-label={`Show ${s.label.toLowerCase()} projects`}
            onClick={() => onSelect(s.risk)}
            className="rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className={cn("h-full transition-colors hover:border-primary/40 hover:bg-accent/40", selected && s.risk !== "all" && "border-primary ring-1 ring-primary/30")}>
              {body}
            </Card>
          </button>
        ) : (
          <Card key={s.label}>{body}</Card>
        );
      })}
    </div>
  );
};
