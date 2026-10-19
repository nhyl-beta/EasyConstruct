import { ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";

/** Direction is the arrow; tone is the meaning (a falling open-RFI count is down + good). */
export type KpiDeltaDirection = "up" | "down" | "flat";
export type KpiDeltaTone = "good" | "bad" | "neutral";

export interface KpiDeltaProps {
  direction: KpiDeltaDirection;
  tone: KpiDeltaTone;
  /** Already formatted, e.g. "4.2%" or "2". Omit for a flat "No change". */
  value?: string;
  className?: string;
}

const deltaTone: Record<KpiDeltaTone, string> = {
  good: "bg-success-soft text-success-strong",
  bad: "bg-destructive-soft text-destructive-strong",
  neutral: "bg-muted text-muted-foreground",
};

const deltaIcon: Record<KpiDeltaDirection, LucideIcon> = {
  up: ArrowUp,
  down: ArrowDown,
  flat: Minus,
};

export function KpiDelta({ direction, tone, value, className }: KpiDeltaProps) {
  const Icon = deltaIcon[direction];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-caption font-medium",
        deltaTone[tone],
        className,
      )}
    >
      <Icon className="size-3" strokeWidth={2.25} aria-hidden="true" />
      {value ?? (direction === "flat" ? "No change" : null)}
    </span>
  );
}

export interface KpiCardProps {
  label: string;
  icon: LucideIcon;
  /** Already formatted. */
  value: ReactNode;
  /** Names the scope: "Across 6 active sites". */
  subLabel?: string;
  /** One series, oldest first. Omit when there is no trend. */
  spark?: number[];
  delta?: Omit<KpiDeltaProps, "className"> & { label?: string };
  /** Colour for the value, e.g. a `*-strong` text token. Pair it with a word. */
  valueClassName?: string;
  className?: string;
}

export function KpiCard({
  label,
  icon: Icon,
  value,
  subLabel,
  spark,
  delta,
  valueClassName,
  className,
}: KpiCardProps) {
  return (
    <article
      className={cn(
        "bg-card text-card-foreground grid gap-4 rounded-lg border border-border p-5 shadow-sm",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <span className="text-body text-muted-foreground">{label}</span>
        <span className="text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full border border-border">
          <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
      </header>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            className={cn(
              "text-kpi-value font-semibold tracking-[-0.02em] tabular-nums",
              valueClassName,
            )}
          >
            {value}
          </div>
          {subLabel && (
            <div className="mt-0.5 text-caption text-muted-foreground">
              {subLabel}
            </div>
          )}
        </div>
        {spark && <Sparkline data={spark} />}
      </div>
      {delta && (
        <footer className="flex items-center gap-2">
          <KpiDelta
            direction={delta.direction}
            tone={delta.tone}
            value={delta.value}
          />
          {delta.label && (
            <span className="text-caption text-muted-foreground">
              {delta.label}
            </span>
          )}
        </footer>
      )}
    </article>
  );
}
