// apps/api/src/finance/cash-flow/months.ts
//
// Pure month and bucketing helpers shared by every money-out figure. A month is
// the calendar month in UTC (timestamps are stored without a zone, as UTC); the
// stored label is "Jan 2026", the sortable key is "2026-01".

const NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export const monthKey = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export const keyToLabel = (key: string): string => {
  const [y, m] = key.split("-");
  return `${NAMES[Number(m) - 1]} ${y}`;
};

/** "Jan 2026" -> "2026-01"; null when the label is not in that form. */
export const labelToKey = (label: string): string | null => {
  const match = /^([A-Za-z]{3}) (\d{4})$/.exec(label.trim());
  if (!match) return null;
  const idx = NAMES.findIndex((n) => n.toLowerCase() === match[1]!.toLowerCase());
  return idx < 0 ? null : `${match[2]}-${String(idx + 1).padStart(2, "0")}`;
};

/** The last `count` calendar month keys ending at (and including) `now`'s month, oldest first. */
export const lastMonthKeys = (count: number, now: Date = new Date()): string[] => {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return keys;
};

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Sums `amount` per month of `at`. */
export const bucketByMonth = (rows: Array<{ at: Date; amount: number }>): Map<string, number> => {
  const out = new Map<string, number>();
  for (const r of rows) {
    const key = monthKey(r.at);
    out.set(key, round2((out.get(key) ?? 0) + r.amount));
  }
  return out;
};

/** What an approved payroll batch costs: employer cost, or gross for legacy batches without one. */
export const payrollCost = (b: { employerCost: number; grossPayroll: number }): number =>
  b.employerCost > 0 ? b.employerCost : b.grossPayroll;

/** Month-by-month total of several bucketed sources. */
export const mergeBuckets = (...sources: Array<Map<string, number>>): Map<string, number> => {
  const out = new Map<string, number>();
  for (const s of sources) for (const [k, v] of s) out.set(k, round2((out.get(k) ?? 0) + v));
  return out;
};

/** Orders cash flow rows by calendar month, oldest first, and keeps the latest `count`. */
export const latestByCalendar = <T extends { month: string }>(rows: T[], count: number): T[] =>
  rows
    .map((r) => ({ r, key: labelToKey(r.month) }))
    .filter((x): x is { r: T; key: string } => x.key !== null)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-count)
    .map((x) => x.r);
