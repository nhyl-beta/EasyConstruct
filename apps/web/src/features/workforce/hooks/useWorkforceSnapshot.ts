// Part C3/C4/E: the one cross-project workforce data path, shared by
// admin-dashboard.tsx's "Workforce snapshot" card and hr-dashboard.tsx. The
// server counts employees and recent attendance (GET /api/dashboard/workforce);
// the browser no longer downloads both full lists to do it.
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/api.client";
import { qk } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

export interface EmployeeRow {
  id: number;
  employeeId: string;
  name: string;
  role: string;
  department: string;
  site: string;
  status: string;
  attendanceRate: number;
  performance: string;
  hiredOn: string;
  payRate: string;
  rateType: string;
}

export interface WorkforceSiteSummary {
  site: string;
  capacity: number;
  assigned: number;
  available: number;
}

export interface WorkforceSnapshot {
  loading: boolean;
  error: Error | null;
  totalEmployees: number;
  totalCapacity: number; // Active employees org-wide
  assignedRecently: number; // distinct employees with an attendance row in the last 30 days
  available: number; // capacity - assignedRecently, floored at 0
  overtimeCrews: number; // distinct employees whose most recent attendance row logged >8h
  sites: WorkforceSiteSummary[];
  windowDays: number;
  reload: () => void;
}

const WINDOW_DAYS = 30;

interface WorkforceFigures {
  headcount: number;
  active: number;
  windowDays: number;
  snapshot: {
    totalEmployees: number;
    totalCapacity: number;
    assignedRecently: number;
    available: number;
    overtimeCrews: number;
    sites: WorkforceSiteSummary[];
  };
}

/**
 * Org-wide workforce figures, counted by the server (GET /api/dashboard/workforce)
 * instead of downloading every employee and every attendance row. One shared
 * query: the HR page header, its Workforce tab and the Admin "Workforce
 * snapshot" card all read the same cached answer.
 */
export function useWorkforceSnapshot(): WorkforceSnapshot {
  const query = useQuery({
    queryKey: qk.dashboard.workforce,
    queryFn: async () => ((await apiClient.get("/dashboard/workforce")) as { data: WorkforceFigures }).data,
    staleTime: STALE.summary,
  });

  const snapshot = query.data?.snapshot;
  return {
    loading: query.isPending,
    error: (query.error as Error | null) ?? null,
    totalEmployees: snapshot?.totalEmployees ?? 0,
    totalCapacity: snapshot?.totalCapacity ?? 0,
    assignedRecently: snapshot?.assignedRecently ?? 0,
    available: snapshot?.available ?? 0,
    overtimeCrews: snapshot?.overtimeCrews ?? 0,
    sites: snapshot?.sites ?? [],
    windowDays: query.data?.windowDays ?? WINDOW_DAYS,
    reload: () => void query.refetch(),
  };
}
