// Fairness report (objectives fix 2.6): read-only, HR and Admin.
import { apiClient } from "@/services/api.client";

export interface FairnessRow {
  employeeId: string;
  name: string;
  position: string;
  projectCode: string;
  days: number;
  hours: number;
  overtimeHours: number;
  tasksAssigned: number;
  tasksCompleted: number;
  tasksOpen: number;
}

export type FairnessFlagKind = "hours_high" | "hours_low" | "overtime_high" | "tasks_high" | "rate_outlier";

export interface FairnessFlag {
  kind: FairnessFlagKind;
  employeeId: string;
  name: string;
  projectCode: string | null;
  message: string;
}

export interface PositionRates {
  position: string;
  rateType: string;
  people: number;
  median: number;
  min: number;
  max: number;
  outliers: { employeeId: string; name: string; payRate: number; diffPct: number }[];
}

export interface FairnessPage {
  items: FairnessRow[];
  total: number;
  page: number;
  pages: number;
  positions: PositionRates[];
  flags: FairnessFlag[];
  basis: string;
}

export async function getFairness(query: {
  page: number;
  pageSize: number;
  dateFrom?: string;
  dateTo?: string;
  projectCode?: string;
}): Promise<FairnessPage> {
  const params = new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize), sort: "projectCode" });
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);
  if (query.projectCode) params.set("projectCode", query.projectCode);
  const json = (await apiClient.get(`/workforce-reports/fairness?${params.toString()}`)) as {
    data: FairnessRow[];
    meta: Omit<FairnessPage, "items">;
  };
  return { items: json.data, ...json.meta };
}
