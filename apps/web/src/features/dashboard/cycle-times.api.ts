// How long approvals, responses, payroll sign-off and issue resolution take (objectives fix 1.4).
import { apiClient } from "@/services/api.client";

export type CycleKind = "workflow-approval" | "request-response" | "payroll-approval" | "issue-resolution";

export interface CycleSeries {
  kind: CycleKind;
  group: string;
  count: number;
  averageHours: number;
  medianHours: number;
  monthly: { month: string; count: number; averageHours: number }[];
}

export interface CycleTimes {
  months: number;
  series: CycleSeries[];
  note: string;
}

export async function getCycleTimes(): Promise<CycleTimes> {
  const json = (await apiClient.get("/dashboard/cycle-times", { staleTime: 60_000 })) as { data: CycleTimes };
  return json.data;
}
