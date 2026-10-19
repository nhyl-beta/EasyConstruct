import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";
import { PayrollSummaryRepository } from "../repositories/payroll-summary.repository";

/** Trend length the Owner dashboard asks for (server clamps to 1–24). */
export const OWNER_TREND_MONTHS = 6;

export function usePayrollSummary(months: number = OWNER_TREND_MONTHS) {
  const query = useQuery({
    queryKey: qk.payroll.summary(months),
    queryFn: () => PayrollSummaryRepository.get(months),
    staleTime: STALE.summary,
  });

  return {
    summary: query.data ?? null,
    loading: query.isPending,
    error: (query.error as Error | null) ?? null,
    reload: () => query.refetch(),
  } as const;
}
