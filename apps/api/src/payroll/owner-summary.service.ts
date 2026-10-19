import * as ownerRepo from "./owner-summary.repository.js";
import type { OwnerBatchRow } from "./owner-summary.repository.js";

// Owner dashboard payroll summary. Read-only and aggregate-only: the rows this
// module sees are one per batch (sums over its lines) and carry no employee
// id, name or pay line — see owner-summary.repository.ts.
//
// "Payroll cost" is approved batches only. Draft, pending and
// revision-required batches feed the pipeline and the attention list, never
// the cost totals.

// ── Thresholds for the attention list ───────────────────────────────────────
export const PENDING_ALERT_DAYS = 3; // pending longer than this → pending_too_long
export const OVERTIME_ALERT_RATIO = 0.15; // overtime / regular hours above this → overtime_high
export const COST_SPIKE_PCT = 20; // latest labor cost above previous by more than this → cost_spike

/** Severity escalates to "critical" at this multiple of the threshold. */
const CRITICAL_MULTIPLE = 2;

export const DEFAULT_MONTHS = 6;
export const MIN_MONTHS = 1;
export const MAX_MONTHS = 24;
const TOP_N = 5;
const DAY_MS = 86_400_000;

const OTHER_PROJECT = "OTHER";
const UNASSIGNED_PROJECT = "UNASSIGNED";

export type AttentionKind =
  | "pending_too_long"
  | "revision_required"
  | "overtime_high"
  | "cost_spike"
  | "no_project";

export interface AttentionItem {
  kind: AttentionKind;
  severity: "info" | "warning" | "critical";
  message: string;
  batchId?: string;
  projectCode?: string;
}

interface Pipeline {
  count: number;
  amount: number;
}

export interface OwnerPayrollSummary {
  asOf: string;
  totals: {
    approvedBatches: number;
    /** Sum of each approved batch's employee count (an employee paid in 3 periods counts 3 times). */
    approvedEmployeeCount: number;
    gross: number;
    deductions: number;
    net: number;
    laborCost: number;
    overtimeHours: number;
  };
  latest: {
    period: string;
    periodEnd: string;
    gross: number;
    net: number;
    laborCost: number;
    employees: number;
    overtimeHours: number;
    vsPreviousPct: number | null;
  } | null;
  pipeline: {
    draft: Pipeline;
    pending: Pipeline & { oldestDays: number };
    revisionRequired: Pipeline;
    approvedThisMonth: Pipeline;
  };
  trend: {
    periodEnd: string;
    label: string;
    gross: number;
    net: number;
    laborCost: number;
    employees: number;
  }[];
  statutory: {
    sss: { employee: number; employer: number };
    philhealth: { employee: number; employer: number };
    pagibig: { employee: number; employer: number };
    ec: number;
  };
  byProject: { projectCode: string; projectName: string; laborCost: number; share: number }[];
  byGroup: { group: string; laborCost: number; share: number }[];
  attention: AttentionItem[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
const sum = (rows: OwnerBatchRow[], pick: (r: OwnerBatchRow) => number) =>
  round2(rows.reduce((acc, r) => acc + pick(r), 0));

export const clampMonths = (raw: unknown): number => {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || raw === undefined || raw === null || raw === "") return DEFAULT_MONTHS;
  return Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, n));
};

/**
 * A batch's period end: the latest dated line, else the day it was created.
 * Never derived from the free-text `period` label.
 */
export const batchPeriodEnd = (row: OwnerBatchRow): string =>
  row.linePeriodEnd ?? row.createdAt.toISOString().slice(0, 10);

/** Percentages to one decimal that add up to exactly 100 (largest-remainder). */
export const sharesOf = (values: number[]): number[] => {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 1000);
  const floors = raw.map(Math.floor);
  let left = 1000 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]! += 1;
    left -= 1;
  }
  return floors.map((f) => f / 10);
};

/** Top N by value plus an "Other" remainder, with shares summing to 100. */
const rank = <K extends { laborCost: number }>(
  items: K[],
  other: (laborCost: number) => K,
): (K & { share: number })[] => {
  const sorted = [...items].sort((a, b) => b.laborCost - a.laborCost);
  const top = sorted.slice(0, TOP_N);
  const rest = sorted.slice(TOP_N);
  const out = rest.length ? [...top, other(round2(rest.reduce((a, r) => a + r.laborCost, 0)))] : top;
  const shares = sharesOf(out.map((o) => o.laborCost));
  return out.map((o, i) => ({ ...o, share: shares[i]! }));
};

interface PeriodAgg {
  periodEnd: string;
  label: string;
  labelAt: number;
  gross: number;
  net: number;
  laborCost: number;
  employees: number;
  overtimeHours: number;
  regularHours: number;
}

const ageDays = (since: Date, now: Date) => (now.getTime() - since.getTime()) / DAY_MS;

const sameUtcMonth = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();

export const buildOwnerSummary = (
  rows: OwnerBatchRow[],
  opts: { now?: Date; months?: number } = {},
): OwnerPayrollSummary => {
  const now = opts.now ?? new Date();
  const months = clampMonths(opts.months);

  const approved = rows.filter((r) => r.status === "approved");

  // ── Periods (approved batches grouped by derived end date) ────────────────
  const byEnd = new Map<string, PeriodAgg>();
  for (const r of approved) {
    const end = batchPeriodEnd(r);
    const p =
      byEnd.get(end) ??
      ({
        periodEnd: end,
        label: r.period,
        labelAt: -Infinity,
        gross: 0,
        net: 0,
        laborCost: 0,
        employees: 0,
        overtimeHours: 0,
        regularHours: 0,
      } satisfies PeriodAgg);
    p.gross += r.gross;
    p.net += r.net;
    p.laborCost += r.employerCost;
    p.employees += r.employees;
    p.overtimeHours += r.overtimeHours;
    p.regularHours += r.lineRegularHours;
    if (r.createdAt.getTime() >= p.labelAt) {
      p.label = r.period;
      p.labelAt = r.createdAt.getTime();
    }
    byEnd.set(end, p);
  }
  // ISO dates sort correctly as strings.
  const periods = [...byEnd.values()].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const lastPeriod = periods.at(-1) ?? null;
  const prevPeriod = periods.at(-2) ?? null;

  const vsPreviousPct =
    lastPeriod && prevPeriod && prevPeriod.laborCost > 0
      ? round1(((lastPeriod.laborCost - prevPeriod.laborCost) / prevPeriod.laborCost) * 100)
      : null;

  // Trend window: periods ending within `months` of the latest approved one
  // (anchored on the data, not on today, so an older data set still charts).
  let windowFrom = "";
  if (lastPeriod) {
    const d = new Date(`${lastPeriod.periodEnd}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - months);
    windowFrom = d.toISOString().slice(0, 10);
  }
  const windowPeriods = periods.filter((p) => p.periodEnd > windowFrom);
  const windowApproved = approved.filter((r) => batchPeriodEnd(r) > windowFrom);

  // ── Pipeline ──────────────────────────────────────────────────────────────
  const pipe = (status: string): Pipeline => {
    const list = rows.filter((r) => r.status === status);
    return { count: list.length, amount: sum(list, (r) => r.employerCost) };
  };
  const pendingRows = rows.filter((r) => r.status === "pending");
  const pendingAge = (r: OwnerBatchRow) => ageDays(r.submittedAt ?? r.createdAt, now);
  const approvedNow = approved.filter((r) => r.reviewedAt && sameUtcMonth(r.reviewedAt, now));

  // ── Attention ─────────────────────────────────────────────────────────────
  const attention: AttentionItem[] = [];
  const ref = (r: OwnerBatchRow) => (r.projectCode ? `${r.id} (${r.projectCode})` : r.id);

  for (const r of pendingRows) {
    const days = pendingAge(r);
    if (days > PENDING_ALERT_DAYS) {
      attention.push({
        kind: "pending_too_long",
        severity: days > PENDING_ALERT_DAYS * CRITICAL_MULTIPLE ? "critical" : "warning",
        message: `Payroll batch ${ref(r)} has been waiting for Finance approval for ${Math.floor(days)} days.`,
        batchId: r.id,
        ...(r.projectCode ? { projectCode: r.projectCode } : {}),
      });
    }
  }
  for (const r of rows.filter((x) => x.status === "revision_required")) {
    attention.push({
      kind: "revision_required",
      severity: "warning",
      message: `Payroll batch ${ref(r)} was sent back to HR and is waiting to be fixed and resubmitted.`,
      batchId: r.id,
      ...(r.projectCode ? { projectCode: r.projectCode } : {}),
    });
  }
  for (const p of windowPeriods) {
    if (p.regularHours > 0 && p.overtimeHours / p.regularHours > OVERTIME_ALERT_RATIO) {
      const pct = round1((p.overtimeHours / p.regularHours) * 100);
      attention.push({
        kind: "overtime_high",
        severity: "warning",
        message: `Overtime in the period "${p.label}" is ${pct}% of regular hours (limit ${OVERTIME_ALERT_RATIO * 100}%).`,
      });
    }
  }
  if (lastPeriod && vsPreviousPct !== null && vsPreviousPct > COST_SPIKE_PCT) {
    attention.push({
      kind: "cost_spike",
      severity: vsPreviousPct > COST_SPIKE_PCT * CRITICAL_MULTIPLE ? "critical" : "warning",
      message: `Labor cost for "${lastPeriod.label}" is ${vsPreviousPct}% above the previous approved period.`,
    });
  }
  for (const r of approved.filter((x) => !x.projectCode)) {
    attention.push({
      kind: "no_project",
      severity: "warning",
      message: `Approved payroll batch ${r.id} is not linked to any project, so its cost is not booked to a project budget.`,
      batchId: r.id,
    });
  }
  const severityOrder = { critical: 0, warning: 1, info: 2 } as const;
  attention.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // ── Breakdowns (all approved batches) ─────────────────────────────────────
  const projectTotals = new Map<string, { projectCode: string; projectName: string; laborCost: number }>();
  const groupTotals = new Map<string, { group: string; laborCost: number }>();
  for (const r of approved) {
    const code = r.projectCode || UNASSIGNED_PROJECT;
    const proj = projectTotals.get(code) ?? {
      projectCode: code,
      projectName: r.projectCode ? (r.projectName ?? r.projectCode) : "No project",
      laborCost: 0,
    };
    proj.laborCost = round2(proj.laborCost + r.employerCost);
    projectTotals.set(code, proj);

    const grp = groupTotals.get(r.group) ?? { group: r.group, laborCost: 0 };
    grp.laborCost = round2(grp.laborCost + r.employerCost);
    groupTotals.set(r.group, grp);
  }

  return {
    asOf: now.toISOString(),
    totals: {
      approvedBatches: approved.length,
      approvedEmployeeCount: approved.reduce((a, r) => a + r.employees, 0),
      gross: sum(approved, (r) => r.gross),
      deductions: sum(approved, (r) => r.deductions),
      net: sum(approved, (r) => r.net),
      laborCost: sum(approved, (r) => r.employerCost),
      overtimeHours: sum(approved, (r) => r.overtimeHours),
    },
    latest: lastPeriod
      ? {
          period: lastPeriod.label,
          periodEnd: lastPeriod.periodEnd,
          gross: round2(lastPeriod.gross),
          net: round2(lastPeriod.net),
          laborCost: round2(lastPeriod.laborCost),
          employees: lastPeriod.employees,
          overtimeHours: round2(lastPeriod.overtimeHours),
          vsPreviousPct,
        }
      : null,
    pipeline: {
      draft: pipe("draft"),
      pending: {
        ...pipe("pending"),
        oldestDays: pendingRows.length
          ? Math.max(...pendingRows.map((r) => Math.floor(pendingAge(r))))
          : 0,
      },
      revisionRequired: pipe("revision_required"),
      approvedThisMonth: {
        count: approvedNow.length,
        amount: sum(approvedNow, (r) => r.employerCost),
      },
    },
    trend: windowPeriods.map((p) => ({
      periodEnd: p.periodEnd,
      label: p.label,
      gross: round2(p.gross),
      net: round2(p.net),
      laborCost: round2(p.laborCost),
      employees: p.employees,
    })),
    statutory: {
      sss: { employee: sum(windowApproved, (r) => r.sss), employer: sum(windowApproved, (r) => r.employerSss) },
      philhealth: {
        employee: sum(windowApproved, (r) => r.philhealth),
        employer: sum(windowApproved, (r) => r.employerPhilhealth),
      },
      pagibig: {
        employee: sum(windowApproved, (r) => r.pagibig),
        employer: sum(windowApproved, (r) => r.employerPagibig),
      },
      ec: sum(windowApproved, (r) => r.employerEc),
    },
    byProject: rank([...projectTotals.values()], (laborCost) => ({
      projectCode: OTHER_PROJECT,
      projectName: "Other",
      laborCost,
    })),
    byGroup: rank([...groupTotals.values()], (laborCost) => ({ group: "Other", laborCost })),
    attention,
  };
};

export const getOwnerSummary = async (monthsParam?: unknown): Promise<OwnerPayrollSummary> =>
  buildOwnerSummary(await ownerRepo.findBatchAggregates(), { months: clampMonths(monthsParam) });
