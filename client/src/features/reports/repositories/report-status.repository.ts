// PM daily, weekly and monthly reports (client demo change #10): which periods a project has a report for.
import { apiClient } from "@/services/api.client";

export type ReportPeriod = "daily" | "weekly" | "monthly";
export const REPORT_PERIODS: ReportPeriod[] = ["daily", "weekly", "monthly"];

export interface ReportCell {
  start: string;
  end: string;
  submitted: boolean;
}

export interface ReportStatus {
  projectCode: string;
  today: string;
  activeFrom: string;
  /** Which reports the project owes right now (empty when it is not under construction or design). */
  applicable: ReportPeriod[];
  documentTypes: Record<ReportPeriod, string>;
  grids: Record<ReportPeriod, ReportCell[]>;
}

export const reportStatusRepository = {
  async get(projectCode: string): Promise<ReportStatus> {
    const json = (await apiClient.get(`/documents/report-status?project=${encodeURIComponent(projectCode)}`)) as { data: ReportStatus };
    return json.data;
  },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), d: Number(iso.slice(8, 10)) });

/** "Oct 12" for a day, "Oct 12 to 18" / "Oct 26 to Nov 1" for a week, "Oct 2026" for a month. */
export function periodLabel(period: ReportPeriod, start: string, end: string): string {
  const s = parts(start);
  const e = parts(end);
  if (period === "monthly") return `${MONTHS[s.m - 1]} ${s.y}`;
  if (period === "daily") return `${MONTHS[s.m - 1]} ${s.d}`;
  return s.m === e.m ? `${MONTHS[s.m - 1]} ${s.d} to ${e.d}` : `${MONTHS[s.m - 1]} ${s.d} to ${MONTHS[e.m - 1]} ${e.d}`;
}
