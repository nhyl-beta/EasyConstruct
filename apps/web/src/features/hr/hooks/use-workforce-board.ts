import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { apiClient } from "@/services/api.client";

export interface WorkforceBoard {
  totals: { headcount: number; active: number; onLeave: number; suspended: number; attendanceRecords: number };
  byDepartment: { department: string; headcount: number; active: number }[];
  bySite: { site: string; headcount: number; present: number }[];
  dailyAttendance: { date: string; present: number; late: number; absent: number }[];
}

const EMPTY: WorkforceBoard = {
  totals: { headcount: 0, active: 0, onLeave: 0, suspended: 0, attendanceRecords: 0 },
  byDepartment: [],
  bySite: [],
  dailyAttendance: [],
};

/**
 * The HR "Workforce reporting" figures for an optional date range, counted by
 * the server (GET /api/dashboard/workforce/board) instead of downloading every
 * employee and attendance row. The previous range stays on screen while a new
 * one loads.
 */
export function useWorkforceBoard(range: { from?: string; to?: string }) {
  const { from, to } = range;
  const query = useQuery({
    queryKey: [...qk.dashboard.workforce, "board", from ?? null, to ?? null] as const,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (from) qs.set("from", from);
      if (to) qs.set("to", to);
      const suffix = qs.toString();
      const json = (await apiClient.get(`/dashboard/workforce/board${suffix ? `?${suffix}` : ""}`)) as { data: WorkforceBoard };
      return json.data;
    },
    placeholderData: keepPreviousData,
    staleTime: STALE.list,
  });

  return {
    board: query.data ?? EMPTY,
    loading: query.isPending,
    error: query.error ? (query.error as Error).message : null,
  };
}
