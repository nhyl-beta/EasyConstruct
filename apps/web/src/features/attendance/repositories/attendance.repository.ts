import { apiClient } from "@/services/api.client";

export interface AttendanceRecord {
  id: number;
  employeeId: string;
  site: string;
  projectCode: string | null;
  clockIn: string;
  clockOut: string | null;
  hours: string | null;
  geofence: string;
  photo: string;
  status: string;
  attendanceStatus: string;
  distanceFromSiteM: number | null;
  photoUrl: string | null;
  logDate: string;
}

export interface ClockInInput {
  employeeId: string;
  site: string;
  projectCode?: string;
  clockIn: string;
  latitude?: number;
  longitude?: number;
  photoUrl?: string;
  logDate: string;
  // E1: offline queue support — see apps/api/src/db/schema/attendance.ts.
  clientRequestId?: string;
  validatedOffline?: boolean;
}

export const attendanceRepository = {
  listForEmployee: (employeeId: string): Promise<{ data: AttendanceRecord[] }> =>
    apiClient.get(`/attendance?employeeId=${encodeURIComponent(employeeId)}`),

  listForProject: (projectCode: string): Promise<{ data: AttendanceRecord[] }> =>
    apiClient.get(`/attendance?projectCode=${encodeURIComponent(projectCode)}`),

  clockIn: (input: ClockInInput): Promise<{ data: AttendanceRecord }> =>
    apiClient.post("/attendance", input),

  clockOut: (id: number, clockOut: string): Promise<{ data: AttendanceRecord }> =>
    apiClient.patch(`/attendance/${id}`, { clockOut }),
};