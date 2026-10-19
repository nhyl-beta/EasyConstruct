// apps/api/src/finance/cash-flow/demo-plan.ts
//
// Pure planning for `npm run demo:cashflow`: where already-approved demo costs
// are dated across the last months, and the DEMO client-payment schedule. No
// randomness and no database, so the same input always yields the same plan.
import { keyToLabel, monthKey, round2 } from "./months.js";

/** Small stable hash for picking a day of the month from an id. */
export const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

/**
 * Spreads `count` items, already in a stable order, over `months` slots with
 * heavier early months (weights months, months-1, ..., 1). Returns each item's
 * slot index (non-decreasing).
 */
export const assignSlots = (count: number, months: number): number[] => {
  if (months <= 0) return [];
  const weights = Array.from({ length: months }, (_, k) => months - k);
  const total = weights.reduce((a, b) => a + b, 0);
  const slots: number[] = [];
  for (let i = 0; i < count; i++) {
    const frac = (i + 0.5) / count;
    let acc = 0;
    let slot = months - 1;
    for (let k = 0; k < months; k++) {
      acc += weights[k]! / total;
      if (frac <= acc) {
        slot = k;
        break;
      }
    }
    slots.push(slot);
  }
  return slots;
};

/**
 * Never after `now`, never before `notBefore` (a project's start). Depends on
 * `now` only through its calendar day, so re-runs on the same day give the
 * same instant.
 */
export const pickInstant = (key: string, seed: string, now: Date, notBefore?: Date): Date => {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let day = 1 + (hashString(seed) % Math.min(lastDay, 27));
  const at = (d: number) => new Date(Date.UTC(y, m - 1, d, 1 + (hashString(seed + "h") % 8), 0, 0));
  let when = at(day);
  if (notBefore && monthKey(notBefore) === key && when < notBefore) {
    day = notBefore.getUTCDate();
    when = new Date(Math.max(at(day).getTime(), notBefore.getTime()));
  }
  if (when > now) {
    // Current month, hashed day still ahead. Days strictly before today are
    // always past whatever the time; with none left (the 1st, or a project
    // starting today) use today's midnight.
    const today = now.getUTCDate();
    const floor = notBefore && monthKey(notBefore) === key ? notBefore.getUTCDate() : 1;
    when = floor < today ? at(Math.max(floor, 1 + (hashString(seed) % (today - 1)))) : new Date(Date.UTC(y, m - 1, today));
  }
  return when;
};

export interface DemoProject {
  code: string;
  contractValue: number;
  /** ISO yyyy-MM-dd, or null. */
  plannedStart: string | null;
  /** 0-100. */
  progress: number;
}

export const ADVANCE_SHARE = 0.1;

/**
 * DEMO client payments for one project over the window, in pesos by month key.
 *   * an advance of 10% of the contract value in the project's start month;
 *   * then progress payments every second month after the start, lagging the work;
 *   * the project's total received never exceeds contract value x min(1, 10% + progress).
 * Months before the window are accounted for in the cap but not returned.
 */
export const projectInflow = (p: DemoProject, windowKeys: string[], now: Date): Map<string, number> => {
  const out = new Map<string, number>();
  if (!p.plannedStart || p.contractValue <= 0) return out;
  const start = new Date(`${p.plannedStart}T00:00:00Z`);
  if (start > now) return out;

  // Every month from the start to now.
  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = monthKey(now);
  while (monthKey(cursor) <= last) {
    months.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const cap = round2(p.contractValue * Math.min(1, ADVANCE_SHARE + p.progress / 100));
  const advance = round2(Math.min(cap, p.contractValue * ADVANCE_SHARE));
  const schedule = new Map<string, number>([[months[0]!, advance]]);

  // Progress payments in months 2, 4, 6... after the start (never the current month).
  const payMonths = months.slice(1, -1).filter((_, i) => i % 2 === 1);
  const remaining = round2(cap - advance);
  const weights = payMonths.map((_, i) => (i % 2 === 0 ? 1 : 1.6));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  let paid = 0;
  payMonths.forEach((m, i) => {
    const isLast = i === payMonths.length - 1;
    const amount = isLast ? round2(remaining - paid) : round2((remaining * weights[i]!) / weightSum);
    paid = round2(paid + amount);
    schedule.set(m, amount);
  });

  for (const k of windowKeys) if (schedule.has(k)) out.set(k, schedule.get(k)!);
  return out;
};

export const labelFor = keyToLabel;
