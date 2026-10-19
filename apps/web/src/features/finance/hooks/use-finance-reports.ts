import type { ScheduledReport } from "@/features/finance/types/finance.types";

interface UseFinanceReportsResult {
  scheduledReports: ScheduledReport[];
  isLoading: boolean;
  error: string | null;
  exportReport: (reportId: string, format: "pdf" | "excel") => void;
}

/**
 * Finance Reports is not wired to the server: there is no /api/finance/reports route (it is
 * commented out in apps/api/src/routes/finance.ts) and the page is not in any role's navigation.
 * This used to call it with a raw fetch() (no token), which could only fail. It now makes no
 * request, so it cannot 401 or 404; wire a real route and apiClient here when reports exist.
 */
export function useFinanceReportsController(): UseFinanceReportsResult {
  return {
    scheduledReports: [],
    isLoading: false,
    error: null,
    exportReport: () => {},
  };
}
