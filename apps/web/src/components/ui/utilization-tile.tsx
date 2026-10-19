import { cn } from "@/lib/utils";

export type UtilizationState = "healthy" | "busy" | "critical";

/** Below 60% Healthy, 60 to 85% Busy, above 85% Critical. */
export function utilizationState(percent: number): UtilizationState {
  if (percent > 85) return "critical";
  if (percent >= 60) return "busy";
  return "healthy";
}

const stateWord: Record<UtilizationState, string> = {
  healthy: "Healthy",
  busy: "Busy",
  critical: "Critical",
};

const stateFill: Record<UtilizationState, string> = {
  healthy: "bg-success",
  busy: "bg-warning",
  critical: "bg-destructive",
};

export interface UtilizationTileProps {
  label: string;
  /** 0 to 100. */
  percent: number;
  className?: string;
}

export function UtilizationTile({
  label,
  percent,
  className,
}: UtilizationTileProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const state = utilizationState(clamped);
  return (
    <div
      className={cn(
        "bg-card grid gap-2 rounded-md border border-border p-4",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-caption text-muted-foreground">
        <span className="truncate">{label}</span>
        <i
          className={cn("size-2 shrink-0 rounded-full", stateFill[state])}
          aria-hidden="true"
        />
      </div>
      <div className="text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums">
        {Math.round(clamped)}%
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span
          className={cn("block h-full rounded-full", stateFill[state])}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {/* The word is required: warning is ~2:1 on card, so colour is never the only signal. */}
      <div className="text-caption font-medium text-muted-foreground">
        {stateWord[state]}
      </div>
    </div>
  );
}
