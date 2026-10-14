import { apiClient } from "@/services/api.client";

// Every money figure below is computed by the server (server/src/payroll/
// engine.ts). The client only displays them and never derives a statutory
// amount.

export type RateVersions = Record<string, string>;

export interface PayrollLine {
  id: number;
  batchId: string | null;
  empId: string;
  name: string;
  initials: string;
  role: string;
  hours: number;
  overtime: number;
  adjustments: number;
  gross: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  /** Sum of the three employee contributions (SSS + PhilHealth + Pag-IBIG). */
  deductions: number;
  net: number;
  employerSss: number;
  employerEc: number;
  employerPhilhealth: number;
  employerPagibig: number;
  employerCost: number;
  rateVersions: RateVersions | null;
  status: string;
  period: string;
}

export type BatchStatus = "draft" | "pending" | "approved" | "revision_required";

export interface PayrollBatch {
  id: string;
  projectCode: string | null;
  period: string;
  group: string;
  employees: number;
  overtimeHours: number;
  grossPayroll: number;
  deductions: number;
  netPayroll: number;
  employerCost: number;
  round: number;
  status: BatchStatus | string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  createdAt: string | null;
}

export interface BatchDecision {
  id: number;
  batchId: string;
  round: number;
  action: "approved" | "rejected";
  reasonCode: string | null;
  comment: string | null;
  decidedBy: string;
  decidedAt: string;
}

export interface BatchTotals {
  employees: number;
  overtimeHours: number;
  gross: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  deductions: number;
  net: number;
  employerSss: number;
  employerEc: number;
  employerPhilhealth: number;
  employerPagibig: number;
  employerCost: number;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  empId?: string;
  /** Stable id of a warning HR must tick before submitting (objectives fix 2.4). */
  key?: string;
  requiresAck?: boolean;
}

export interface BatchDetail {
  batch: PayrollBatch;
  lines: PayrollLine[];
  decisions: BatchDecision[];
  totals: BatchTotals;
  rateVersions: Record<string, string>;
  needsVerification: string[];
  validation: ValidationIssue[];
}

export interface GeneratePayrollEntry {
  employeeId: string;
  hoursWorked: number;
  overtimeHours?: number;
  adjustments?: number;
}

export interface GeneratePayrollInput {
  period: string;
  group?: string;
  projectCode?: string;
  entries: GeneratePayrollEntry[];
}

export interface LineEdit {
  hours?: number;
  overtime?: number;
  adjustments?: number;
}

export const REJECTION_REASONS: Array<{ value: string; label: string }> = [
  { value: "attendance_discrepancy", label: "Attendance discrepancy" },
  { value: "incorrect_basic_pay", label: "Incorrect basic pay" },
  { value: "incorrect_overtime", label: "Incorrect overtime" },
  { value: "incorrect_sss", label: "Incorrect SSS" },
  { value: "incorrect_philhealth", label: "Incorrect PhilHealth" },
  { value: "incorrect_pagibig", label: "Incorrect Pag-IBIG" },
  { value: "missing_employee_information", label: "Missing employee information" },
  { value: "incorrect_government_rate", label: "Incorrect government rate" },
  { value: "other", label: "Other" },
];

// Unknown or legacy codes (a reason that has since been retired) read as "Other".
export const reasonLabel = (code: string | null | undefined) =>
  code ? (REJECTION_REASONS.find((r) => r.value === code)?.label ?? "Other") : "";

/** Agencies whose rate version is shown; any other stored key is ignored. */
export const RATE_VERSION_AGENCIES = ["sss", "philhealth", "pagibig", "overtime"] as const;
export const visibleRateVersions = (versions: RateVersions | null | undefined): Array<[string, string]> =>
  Object.entries(versions ?? {}).filter(([k]) => (RATE_VERSION_AGENCIES as readonly string[]).includes(k));

export const BATCH_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending: "Pending Finance review",
  approved: "Approved",
  revision_required: "Revision required",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

type RawLine = Omit<
  PayrollLine,
  | "hours" | "overtime" | "adjustments" | "gross" | "sss" | "philhealth" | "pagibig"
  | "deductions" | "net" | "employerSss" | "employerEc"
  | "employerPhilhealth" | "employerPagibig" | "employerCost"
> & Record<string, string | number | null | RateVersions | undefined>;

const num = (v: unknown) => Number(v ?? 0);

export function normalizeLine(raw: RawLine): PayrollLine {
  return {
    id: raw.id,
    batchId: raw.batchId ?? null,
    empId: raw.empId,
    name: raw.name,
    initials: raw.initials,
    role: raw.role,
    hours: num(raw.hours),
    overtime: num(raw.overtime),
    adjustments: num(raw.adjustments),
    gross: num(raw.gross),
    sss: num(raw.sss),
    philhealth: num(raw.philhealth),
    pagibig: num(raw.pagibig),
    deductions: num(raw.deductions),
    net: num(raw.net),
    employerSss: num(raw.employerSss),
    employerEc: num(raw.employerEc),
    employerPhilhealth: num(raw.employerPhilhealth),
    employerPagibig: num(raw.employerPagibig),
    employerCost: num(raw.employerCost),
    rateVersions: (raw.rateVersions as RateVersions | null) ?? null,
    status: raw.status,
    period: raw.period,
  };
}

export function normalizeBatch(raw: Record<string, unknown>): PayrollBatch {
  return {
    id: String(raw.id),
    projectCode: (raw.projectCode as string | null) ?? null,
    period: String(raw.period),
    group: String(raw.group ?? ""),
    employees: num(raw.employees),
    overtimeHours: num(raw.overtimeHours),
    grossPayroll: num(raw.grossPayroll),
    deductions: num(raw.deductions),
    netPayroll: num(raw.netPayroll),
    employerCost: num(raw.employerCost),
    round: num(raw.round) || 1,
    status: String(raw.status),
    reviewedBy: (raw.reviewedBy as string | null) ?? null,
    reviewedAt: (raw.reviewedAt as string | null) ?? null,
    reviewNote: (raw.reviewNote as string | null) ?? null,
    submittedAt: (raw.submittedAt as string | null) ?? null,
    createdAt: (raw.createdAt as string | null) ?? null,
  };
}

export async function listPayroll(period?: string, batchId?: string): Promise<PayrollLine[]> {
  const params = new URLSearchParams();
  if (period) params.set("period", period);
  if (batchId) params.set("batchId", batchId);
  const qs = params.toString();
  const raw = await unwrap<RawLine[]>(apiClient.get(`/payroll${qs ? `?${qs}` : ""}`));
  return raw.map(normalizeLine);
}

export interface PayrollLineTotals {
  lines: number;
  gross: number;
  net: number;
  employerCost: number;
  hours: number;
}

/** One page of payroll lines, plus the sums over every line the filter selects. */
export async function listPayrollPage(params: {
  page: number;
  limit: number;
  period?: string | null;
}): Promise<{ items: PayrollLine[]; total: number; pages: number; totals: PayrollLineTotals }> {
  const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit), totals: "1" });
  if (params.period) qs.set("period", params.period);
  const json = (await apiClient.get(`/payroll?${qs.toString()}`)) as {
    data: RawLine[];
    meta: { total: number; pages: number; totals: PayrollLineTotals };
  };
  return { items: json.data.map(normalizeLine), total: json.meta.total, pages: json.meta.pages, totals: json.meta.totals };
}

/** Every line of a period, 100 per request (for CSV export). */
export async function listPayrollAll(period?: string | null): Promise<PayrollLine[]> {
  const all: PayrollLine[] = [];
  for (let page = 1; ; page++) {
    const result = await listPayrollPage({ page, limit: 100, period });
    all.push(...result.items);
    if (page >= result.pages || result.items.length === 0) return all;
  }
}

export async function listPayrollBatches(): Promise<PayrollBatch[]> {
  const raw = await unwrap<Record<string, unknown>[]>(apiClient.get("/payroll/batches/all"));
  return raw.map(normalizeBatch);
}

export async function getBatchDetail(id: string): Promise<BatchDetail> {
  const raw = await unwrap<
    Omit<BatchDetail, "batch" | "lines" | "totals"> & {
      batch: Record<string, unknown>;
      lines: RawLine[];
      totals: Record<string, unknown>;
    }
  >(apiClient.get(`/payroll/batches/${encodeURIComponent(id)}`));
  return {
    ...raw,
    batch: normalizeBatch(raw.batch),
    lines: raw.lines.map(normalizeLine),
    totals: Object.fromEntries(
      Object.entries(raw.totals).map(([k, v]) => [k, num(v)]),
    ) as unknown as BatchTotals,
  };
}

// G5: verified attendance for a project, summed per employee — used to
// prefill the Generate form's entries instead of typing hours by hand.
export async function getAttendanceSummary(
  projectCode: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<GeneratePayrollEntry[]> {
  const params = new URLSearchParams({ projectCode });
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  return unwrap<GeneratePayrollEntry[]>(apiClient.get(`/payroll/attendance-summary?${params.toString()}`));
}

// Creates a draft batch (server-persisted, invisible to Finance until submitted).
export async function generatePayroll(
  input: GeneratePayrollInput,
): Promise<{ lines: PayrollLine[]; batch: PayrollBatch }> {
  const raw = await unwrap<{ lines: RawLine[]; batch: Record<string, unknown> }>(
    apiClient.post("/payroll/generate", input),
  );
  return { lines: raw.lines.map(normalizeLine), batch: normalizeBatch(raw.batch) };
}

export async function updatePayrollLine(id: number, edit: LineEdit): Promise<PayrollLine> {
  return normalizeLine(await unwrap<RawLine>(apiClient.patch(`/payroll/${id}`, edit)));
}

export async function addPayrollLine(batchId: string, entry: GeneratePayrollEntry): Promise<PayrollLine> {
  return normalizeLine(
    await unwrap<RawLine>(apiClient.post(`/payroll/batches/${encodeURIComponent(batchId)}/lines`, entry)),
  );
}

export async function removePayrollLine(id: number): Promise<void> {
  await apiClient.del(`/payroll/${id}`);
}

export async function discardBatch(id: string): Promise<void> {
  await apiClient.del(`/payroll/batches/${encodeURIComponent(id)}`);
}

export async function submitBatch(
  id: string,
  confirmDuplicate = false,
  acknowledgedWarnings: string[] = [],
): Promise<PayrollBatch> {
  return normalizeBatch(
    await unwrap<Record<string, unknown>>(
      apiClient.post(`/payroll/batches/${encodeURIComponent(id)}/submit`, { confirmDuplicate, acknowledgedWarnings }),
    ),
  );
}

export type Agency = "sss" | "philhealth" | "pagibig";

export interface ContributionRow {
  batchId: string;
  projectCode: string | null;
  empId: string;
  name: string;
  period: string;
  employeeShare: number;
  employerShare: number;
  ec?: number;
  rateVersion: string;
}

export async function getContributionReport(agency: Agency, period: string): Promise<ContributionRow[]> {
  const params = new URLSearchParams({ agency, period });
  return unwrap<ContributionRow[]>(apiClient.get(`/payroll/reports/contributions?${params.toString()}`));
}

export interface ExcludedWorker {
  employeeId: string;
  name: string;
  status: string;
  reason: string;
}

export interface AttendanceReadiness {
  entries: GeneratePayrollEntry[];
  unverifiedCount: number;
  excludedWorkers: ExcludedWorker[];
}

// Wizard step 2: verified hours per payable employee, plus what is left out.
export async function getAttendanceReadiness(
  projectCode: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<AttendanceReadiness> {
  const params = new URLSearchParams({ projectCode });
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  return unwrap<AttendanceReadiness>(apiClient.get(`/payroll/attendance-readiness?${params.toString()}`));
}

// ── Payroll rules in force (objectives fix 2.8) ──────────────────────────

export interface PayrollRulesSummary {
  versions: RateVersions;
  needsVerification: string[];
  overtimeMultiplier: number;
  hoursPerDay: number;
  workingDaysPerMonth: number;
  notCertified: string;
}

export async function getPayrollRules(): Promise<PayrollRulesSummary> {
  return unwrap<PayrollRulesSummary>(apiClient.get("/payroll/rules", { staleTime: 5 * 60_000 }));
}

// ── Calculation trace (objectives fix 2.5) ───────────────────────────────

export interface TraceStep {
  label: string;
  formula: string;
  amount: number | null;
}

export interface TraceAttendanceRow {
  id: number;
  logDate: string;
  clockIn: string;
  clockOut: string | null;
  hours: number;
  attendanceStatus: string;
  verification: string;
  counted: boolean;
  regular: number;
  overtime: number;
}

export interface PayrollTrace {
  line: { id: number; empId: string; name: string; period: string; batchId: string | null };
  notCertified: string;
  steps: TraceStep[];
  rateVersions: Record<string, string> | null;
  attendance: TraceAttendanceRow[];
  attendanceTotals: { regular: number; overtime: number; unverifiedRecords: number };
  hoursNote: string;
  recomputed: { matches: boolean; differences: string[] };
}

export async function getPayrollTrace(lineId: number): Promise<PayrollTrace> {
  return unwrap<PayrollTrace>(apiClient.get(`/payroll/${lineId}/trace`));
}
