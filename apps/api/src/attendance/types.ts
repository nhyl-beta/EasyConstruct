export interface AttendanceRecord {
  id: number;
  employeeId: string;
  site: string;
  clockIn: string;
  clockOut: string | null;
  hours: string | null;
  geofence: string;
  photo: string;
  status: string;
  attendanceStatus: string;
  remarks: string | null;
  logDate: string;
  /** "Clock-in" (live) or "Sheet" (imported from a spreadsheet). */
  source: string;
  createdAt: Date | null;
}

export interface CreateAttendanceInput {
  employeeId: string;
  site: string;
  clockIn: string;
  clockOut?: string;
  geofence?: string;
  photo?: string;
  status?: string;
  attendanceStatus?: string;
  remarks?: string;
  logDate: string;
  // E1: offline queue support — see db/schema/attendance.ts.
  clientRequestId?: string;
  validatedOffline?: boolean;
}

export interface UpdateAttendanceInput extends Partial<CreateAttendanceInput> {}

export interface AttendanceFilters {
  employeeId?: string;
  projectCode?: string;
  status?: string; // attendanceStatus: Present | Absent | Late | On Leave | Half Day
  dateFrom?: string;
  dateTo?: string;
  /** Matches the employee id or name. */
  search?: string;
  /** Verification status (attendance.status): Verified | Pending | Flagged. */
  verification?: string;
}
