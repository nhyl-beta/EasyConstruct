import { cn } from "@/lib/utils";

const WIDTH = 96;
const HEIGHT = 44;
const PAD = 3;

interface SparklineProps {
  /** One series, oldest first. Fewer than two points renders nothing. */
  data: number[];
  className?: string;
}

/** One-series trend line: `chart-1` stroke over a `primary-soft` area, no axes. */
export function Sparkline({ data, className }: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = WIDTH / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = PAD + (HEIGHT - PAD * 2) * (1 - (v - min) / span);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const line = `M${points.join(" L")}`;
  const area = `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT}Z`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={cn("h-11 w-24 shrink-0", className)}
      aria-hidden="true"
    >
      <path d={area} className="fill-primary-soft stroke-none" />
      <path
        d={line}
        className="fill-none stroke-chart-1"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
