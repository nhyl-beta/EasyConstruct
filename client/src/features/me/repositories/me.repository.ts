// A signed-in person's own attendance and approved payslips (objectives fix 2.5).
import { apiClient } from "@/services/api.client";

export interface MyEmployee {
  linked: boolean;
  employee: { employeeId: string; name: string; position: string; department: string; status: string } | null;
}

export interface MyAttendanceRow {
  id: number;
  logDate: string;
  site: string;
  projectCode: string | null;
  clockIn: string;
  clockOut: string | null;
  hours: number | null;
  attendanceStatus: string;
  verification: string;
  remarks: string | null;
}

export interface MyPayslip {
  id: number;
  batchId: string | null;
  period: string;
  projectCode: string | null;
  approvedAt: string | null;
  hours: number;
  overtime: number;
  adjustments: number;
  gross: number;
  sss: number;
  philhealth: number;
  pagibig: number;
  deductions: number;
  net: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const meRepository = {
  employee: () => unwrap<MyEmployee>(apiClient.get("/me/employee")),
  attendance: (dateFrom?: string) =>
    unwrap<MyAttendanceRow[]>(apiClient.get(`/me/attendance${dateFrom ? `?dateFrom=${dateFrom}` : ""}`)),
  payslips: () => unwrap<MyPayslip[]>(apiClient.get("/me/payslips")),
};
