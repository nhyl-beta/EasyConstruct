import { apiClient } from "@/services/api.client";
import type {
  AttentionKind,
  AttentionSeverity,
  EmployeeEmployerShare,
  PayrollAttentionItem,
  PayrollLatestPeriod,
  PayrollSummary,
  PayrollTrendPoint,
  PipelineStage,
} from "../types/payroll-summary.types";

type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);

const KINDS: AttentionKind[] = [
  "pending_too_long",
  "revision_required",
  "overtime_high",
  "cost_spike",
  "no_project",
];
const SEVERITIES: AttentionSeverity[] = ["info", "warning", "critical"];

const stage = (v: unknown): PipelineStage => {
  const o = obj(v);
  return { count: num(o.count), amount: num(o.amount) };
};

const share = (v: unknown): EmployeeEmployerShare => {
  const o = obj(v);
  return { employee: num(o.employee), employer: num(o.employer) };
};

const latest = (v: unknown): PayrollLatestPeriod | null => {
  if (!v || typeof v !== "object") return null;
  const o = obj(v);
  return {
    period: str(o.period),
    periodEnd: str(o.periodEnd),
    gross: num(o.gross),
    net: num(o.net),
    laborCost: num(o.laborCost),
    employees: num(o.employees),
    overtimeHours: num(o.overtimeHours),
    vsPreviousPct: o.vsPreviousPct === null || o.vsPreviousPct === undefined ? null : num(o.vsPreviousPct),
  };
};

const trendPoint = (v: unknown): PayrollTrendPoint => {
  const o = obj(v);
  return {
    periodEnd: str(o.periodEnd),
    label: str(o.label),
    gross: num(o.gross),
    net: num(o.net),
    laborCost: num(o.laborCost),
    employees: num(o.employees),
  };
};

const attentionItem = (v: unknown): PayrollAttentionItem | null => {
  const o = obj(v);
  const kind = KINDS.find((k) => k === o.kind);
  const severity = SEVERITIES.find((s) => s === o.severity);
  if (!kind || !severity) return null;
  return {
    kind,
    severity,
    message: str(o.message),
    ...(typeof o.batchId === "string" ? { batchId: o.batchId } : {}),
    ...(typeof o.projectCode === "string" ? { projectCode: o.projectCode } : {}),
  };
};

/** Unwraps the `{ success, message, data }` envelope and coerces every number. */
export const normalizePayrollSummary = (json: unknown): PayrollSummary => {
  const root = obj(json);
  const d = obj("data" in root ? root.data : root);
  const totals = obj(d.totals);
  const pipeline = obj(d.pipeline);
  const statutory = obj(d.statutory);

  return {
    asOf: str(d.asOf),
    totals: {
      approvedBatches: num(totals.approvedBatches),
      approvedEmployeeCount: num(totals.approvedEmployeeCount),
      gross: num(totals.gross),
      deductions: num(totals.deductions),
      net: num(totals.net),
      laborCost: num(totals.laborCost),
      overtimeHours: num(totals.overtimeHours),
    },
    latest: latest(d.latest),
    pipeline: {
      draft: stage(pipeline.draft),
      pending: { ...stage(pipeline.pending), oldestDays: num(obj(pipeline.pending).oldestDays) },
      revisionRequired: stage(pipeline.revisionRequired),
      approvedThisMonth: stage(pipeline.approvedThisMonth),
    },
    trend: arr(d.trend).map(trendPoint),
    statutory: {
      sss: share(statutory.sss),
      philhealth: share(statutory.philhealth),
      pagibig: share(statutory.pagibig),
      ec: num(statutory.ec),
    },
    byProject: arr(d.byProject).map((p) => {
      const o = obj(p);
      return {
        projectCode: str(o.projectCode),
        projectName: str(o.projectName, str(o.projectCode)),
        laborCost: num(o.laborCost),
        share: num(o.share),
      };
    }),
    byGroup: arr(d.byGroup).map((g) => {
      const o = obj(g);
      return { group: str(o.group), laborCost: num(o.laborCost), share: num(o.share) };
    }),
    attention: arr(d.attention)
      .map(attentionItem)
      .filter((a): a is PayrollAttentionItem => a !== null),
  };
};

export const PayrollSummaryRepository = {
  async get(months?: number): Promise<PayrollSummary> {
    const qs = months ? `?months=${encodeURIComponent(String(months))}` : "";
    return normalizePayrollSummary(await apiClient.get(`/payroll/owner-summary${qs}`));
  },
};
