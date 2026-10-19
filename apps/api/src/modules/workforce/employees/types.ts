export interface EmployeeRecord {
  id: number;
  employeeId: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  site: string;
  status: string;
  attendanceRate: number;
  performance: string;
  hiredOn: string;
  email: string | null;
  phone: string | null;
  payRate: string;
  rateType: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateEmployeeInput {
  employeeId: string;
  name: string;
  role: string;
  department: string;
  site: string;
  status?: string;
  hiredOn: string;
  email?: string;
  phone?: string;
  payRate?: number | string;
  rateType?: string;
  /** Create anyway although an employee with the same or a very similar name exists (fix 1.2). Never stored. */
  confirmDuplicate?: boolean;
}

export interface UpdateEmployeeInput extends Partial<CreateEmployeeInput> {}

export interface EmployeeFilters {
  search?: string;
  /** Exact employee code (e.g. "EMP-001") — resolves a code under pagination; additive to `search`. */
  employeeId?: string;
  department?: string;
  status?: string;
}
