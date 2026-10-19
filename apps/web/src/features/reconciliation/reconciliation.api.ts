// Read-only cross-checks over stored numbers (objectives fix 1.3).
import { apiClient } from "@/services/api.client";

export interface ReconciliationMismatch {
  subject: string;
  detail: string;
  link: string;
}

export interface ReconciliationCheck {
  key: string;
  title: string;
  basis: string;
  status: "pass" | "fail";
  checked: number;
  mismatchCount: number;
  mismatches: ReconciliationMismatch[];
  firstLink: string | null;
}

export interface ReconciliationReport {
  ranAt: string;
  passed: boolean;
  failing: number;
  total: number;
  checks: ReconciliationCheck[];
}

export async function getReconciliation(): Promise<ReconciliationReport> {
  const json = (await apiClient.get("/admin/reconciliation")) as { data: ReconciliationReport };
  return json.data;
}
