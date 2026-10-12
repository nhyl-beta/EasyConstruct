// Calendar-date helpers. The business runs in Manila time, so "today" is the
// Manila date, not the server's (Vercel runs in UTC).
export const todayManila = (now: Date = new Date()): string =>
  now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

/** ISO date `days` after (or before, if negative) `iso` (YYYY-MM-DD). */
export const addDaysIso = (iso: string, days: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Whole days from `a` to `b` (b - a), both YYYY-MM-DD. */
export const daysBetweenIso = (a: string, b: string): number =>
  Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
