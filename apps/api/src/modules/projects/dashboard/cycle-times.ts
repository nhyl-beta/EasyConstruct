// apps/api/src/dashboard/cycle-times.ts: pure, no I/O (objectives fix 1.4)
//
// How long things take from start to finish, worked out from timestamps the
// system already stores. No new data is collected: each series is a start and an
// end that exist on a record. Averages are in hours; the monthly series groups
// by the month the work finished.

export type CycleKind = "workflow-approval" | "request-response" | "payroll-approval" | "issue-resolution";

export interface CycleSample {
  kind: CycleKind;
  /** Sub-group within the kind: the workflow template, RFI vs RFA, or "All". */
  group: string;
  start: Date;
  end: Date;
}

export interface MonthPoint {
  /** YYYY-MM of the end date, in Manila time. */
  month: string;
  count: number;
  averageHours: number;
}

export interface CycleSeries {
  kind: CycleKind;
  group: string;
  count: number;
  averageHours: number;
  medianHours: number;
  monthly: MonthPoint[];
}

export const KIND_LABEL: Record<CycleKind, string> = {
  "workflow-approval": "Workflow approval",
  "request-response": "RFI/RFA response",
  "payroll-approval": "Payroll submit to approval",
  "issue-resolution": "Issue time to resolve",
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const monthOf = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).slice(0, 7);

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

export const hoursBetween = (start: Date, end: Date): number => (end.getTime() - start.getTime()) / 3_600_000;

/**
 * Groups samples by kind and group. A sample whose end is before its start (a
 * data glitch) is dropped rather than averaged in as a negative.
 */
export const summarizeCycles = (samples: CycleSample[]): CycleSeries[] => {
  const groups = new Map<string, { kind: CycleKind; group: string; hours: number[]; byMonth: Map<string, number[]> }>();
  for (const s of samples) {
    const h = hoursBetween(s.start, s.end);
    if (!Number.isFinite(h) || h < 0) continue;
    const key = `${s.kind}|${s.group}`;
    const g = groups.get(key) ?? { kind: s.kind, group: s.group, hours: [] as number[], byMonth: new Map<string, number[]>() };
    g.hours.push(h);
    const month = monthOf(s.end);
    g.byMonth.set(month, [...(g.byMonth.get(month) ?? []), h]);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      kind: g.kind,
      group: g.group,
      count: g.hours.length,
      averageHours: round1(g.hours.reduce((a, b) => a + b, 0) / g.hours.length),
      medianHours: round1(median(g.hours)),
      monthly: [...g.byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, hs]) => ({ month, count: hs.length, averageHours: round1(hs.reduce((a, b) => a + b, 0) / hs.length) })),
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.group.localeCompare(b.group));
};

/** "36.5 hours" or "2.3 days" for a card. */
export const formatDuration = (hours: number): string =>
  hours >= 48 ? `${round1(hours / 24)} days` : `${round1(hours)} hours`;
