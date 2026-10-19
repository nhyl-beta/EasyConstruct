import type { LucideIcon } from "lucide-react";

import { KpiCard, type KpiCardProps } from "@/components/ui/kpi-card";

export type KpiTone = "good" | "warn" | "bad" | "neutral";

export interface KpiItem {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: KpiTone;
  /** Optional trend and delta, passed straight to <KpiCard>. */
  spark?: KpiCardProps["spark"];
  delta?: KpiCardProps["delta"];
}

// Strong text tokens, not the base colours: the value sits on the card ground,
// and `warning` is a mark/meter fill only. The hint line carries the words.
const toneText: Record<KpiTone, string> = {
  good: "text-success-strong",
  warn: "text-warning-strong",
  bad: "text-destructive-strong",
  neutral: "text-foreground",
};

interface KpiStripProps {
  items: KpiItem[];
}

/** One KPI row: four cards by default, never more than five per row. */
export function KpiStrip({ items }: KpiStripProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <KpiCard
          key={item.label}
          label={item.label}
          icon={item.icon}
          value={item.value}
          subLabel={item.hint}
          spark={item.spark}
          delta={item.delta}
          valueClassName={toneText[item.tone ?? "neutral"]}
        />
      ))}
    </div>
  );
}
