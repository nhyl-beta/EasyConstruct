// Owner-facing payroll summary (GET /api/payroll/owner-summary). Aggregates of
// approved payroll only: there is deliberately no employee, name or pay-line
// field anywhere in these types. All money is PHP.

export type AttentionKind =
  | "pending_too_long"
  | "revision_required"
  | "overtime_high"
  | "cost_spike"
  | "no_project";

export type AttentionSeverity = "info" | "warning" | "critical";

export interface PayrollAttentionItem {
  kind: AttentionKind;
  severity: AttentionSeverity;
  message: string;
  batchId?: string;
  projectCode?: string;
}

export interface PipelineStage {
  count: number;
  amount: number;
}

export interface PayrollTrendPoint {
  periodEnd: string;
  label: string;
  gross: number;
  net: number;
  laborCost: number;
  employees: number;
}

export interface EmployeeEmployerShare {
  employee: number;
  employer: number;
}

export interface PayrollLatestPeriod {
  period: string;
  periodEnd: string;
  gross: number;
  net: number;
  laborCost: number;
  employees: number;
  overtimeHours: number;
  vsPreviousPct: number | null;
}

export interface PayrollSummary {
  asOf: string;
  totals: {
    approvedBatches: number;
    approvedEmployeeCount: number;
    gross: number;
    deductions: number;
    net: number;
    laborCost: number;
    overtimeHours: number;
  };
  latest: PayrollLatestPeriod | null;
  pipeline: {
    draft: PipelineStage;
    pending: PipelineStage & { oldestDays: number };
    revisionRequired: PipelineStage;
    approvedThisMonth: PipelineStage;
  };
  trend: PayrollTrendPoint[];
  statutory: {
    sss: EmployeeEmployerShare;
    philhealth: EmployeeEmployerShare;
    pagibig: EmployeeEmployerShare;
    ec: number;
  };
  byProject: { projectCode: string; projectName: string; laborCost: number; share: number }[];
  byGroup: { group: string; laborCost: number; share: number }[];
  attention: PayrollAttentionItem[];
}
