export type EmployeeStatus = "Active" | "On Leave" | "Suspended" | "Archived";

// Mirrors client/src/providers/mock-data.ts's Employee shape (id = employeeId
// string like "EMP-001") but adds `dbId` — the real numeric primary key
// needed to call the backend for get/update/delete — plus the new
// contact/payroll fields the backend now persists.
export interface Employee {
  id: string; // employeeId, e.g. "EMP-001" — kept for display/search compat
  dbId: number; // numeric DB primary key — required for API calls
  name: string;
  initials: string;
  role: string;
  department: string;
  site: string;
  status: EmployeeStatus;
  attendanceRate: number;
  performance: number;
  hiredOn: string;
  email: string;
  phone: string;
  payRate: string;
  rateType: string;
}

// The shape EmployeeCreatePage.tsx submits/reads.
export interface EmployeeInput {
  employeeId: string;
  name: string;
  role: string;
  department: string;
  site: string;
  status?: EmployeeStatus;
  hiredOn: string;
  email?: string;
  phone?: string;
  payRate?: number;
  rateType?: string;
  /** Create anyway although an employee with the same or a very similar name exists. */
  confirmDuplicate?: boolean;
}

export interface EmployeeQuery {
  search?: string;
  department?: string;
  status?: string;
}
