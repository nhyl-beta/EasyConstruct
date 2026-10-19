import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface RingGaugeProps {
  /** 0 to 100. */
  percent: number;
  /** Centre content; defaults to the rounded percentage. */
  children?: ReactNode;
  /** Accessible name, e.g. "Leave balance". */
  label: string;
  /** Outer size in px. */
  size?: number;
  className?: string;
}

const STROKE = 10;

/** Circular progress: `chart-1` stroke on a `muted` track, value in the centre. */
export function RingGauge({
  percent,
  children,
  label,
  size = 96,
  className,
}: RingGaugeProps) {
  const clamped = Math.min(100, Math.max(0, percent));
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="stroke-chart-1 transition-[stroke-dashoffset] duration-150 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-section-title font-semibold tracking-[-0.02em] tabular-nums">
        {children ?? `${Math.round(clamped)}%`}
      </div>
    </div>
  );
}
