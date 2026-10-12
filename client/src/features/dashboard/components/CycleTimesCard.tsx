// How long things take (objectives fix 1.4): workflow approvals by template,
// RFI/RFA responses, payroll sign-off and issue resolution, from timestamps the
// system already stores. Read-only, for the Owner and Admin dashboards.
import { useEffect, useState } from "react";

import { SectionCard } from "@/components/ui/section-card";
import { Sparkline } from "@/components/ui/sparkline";
import { getCycleTimes, type CycleKind, type CycleSeries, type CycleTimes } from "../cycle-times.api";

const KIND_LABEL: Record<CycleKind, string> = {
  "workflow-approval": "Workflow approval",
  "request-response": "RFI/RFA response",
  "payroll-approval": "Payroll submit to approval",
  "issue-resolution": "Issue time to resolve",
};

const duration = (hours: number) => (hours >= 48 ? `${Math.round((hours / 24) * 10) / 10} days` : `${Math.round(hours * 10) / 10} hours`);

function Row({ s }: { s: CycleSeries }) {
  const label = s.group === "All" ? KIND_LABEL[s.kind] : `${KIND_LABEL[s.kind]}: ${s.group}`;
  const trend = s.monthly.map((m) => m.averageHours);
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0">
      <div className="min-w-0">
        <div className="truncate font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">
          {s.count} finished, median {duration(s.medianHours)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {trend.length > 1 && (
          <span title={`Monthly average: ${s.monthly.map((m) => `${m.month} ${duration(m.averageHours)}`).join(", ")}`}>
            <Sparkline data={trend} className="h-6 w-20" />
          </span>
        )}
        <span className="w-24 text-right font-semibold tabular-nums">{duration(s.averageHours)}</span>
      </div>
    </li>
  );
}

export function CycleTimesCard() {
  const [data, setData] = useState<CycleTimes | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCycleTimes()
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load cycle times"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SectionCard
      title="How long things take"
      subtitle="Average time from start to finish over the last 12 months, from records the system already keeps."
    >
      {error ? (
        <p role="alert" className="text-sm text-destructive-strong">
          Couldn't load cycle times. {error}
        </p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Working it out…</p>
      ) : data.series.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing has finished in the last 12 months yet.</p>
      ) : (
        <>
          <ul>
            {data.series.map((s) => (
              <Row key={`${s.kind}-${s.group}`} s={s} />
            ))}
          </ul>
          <p className="pt-2 text-overline text-muted-foreground">{data.note}</p>
        </>
      )}
    </SectionCard>
  );
}
