import { apiClient } from "@/services/api.client";
import type { Employee, EmployeeInput, EmployeeQuery, EmployeeStatus } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Backend → frontend normalization (backend stores status as free-text
// varchar; numeric columns like payRate/performance come back as strings
// from Drizzle's `numeric` type).
// ─────────────────────────────────────────────────────────────────────────────

interface BackendEmployee {
  id: number;
  employeeId: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  site: string;
  status: string;
  attendanceRate: number | null;
  performance: string | number | null;
  hiredOn: string;
  email: string | null;
  phone: string | null;
  payRate: string | number | null;
  rateType: string | null;
}

const VALID_STATUSES: EmployeeStatus[] = ["Active", "On Leave", "Suspended", "Archived"];

function normalizeStatus(status: string | undefined): EmployeeStatus {
  return VALID_STATUSES.includes(status as EmployeeStatus)
    ? (status as EmployeeStatus)
    : "Active";
}

function normalize(raw: BackendEmployee): Employee {
  return {
    id: raw.employeeId,
    dbId: raw.id,
    name: raw.name,
    initials: raw.initials,
    role: raw.role,
    department: raw.department,
    site: raw.site,
    status: normalizeStatus(raw.status),
    attendanceRate: Number(raw.attendanceRate ?? 0),
    performance: Number(raw.performance ?? 0),
    hiredOn: raw.hiredOn,
    email: raw.email ?? "",
    phone: raw.phone ?? "",
    payRate: raw.payRate != null ? String(raw.payRate) : "0",
    rateType: raw.rateType ?? "Monthly",
  };
}

// Unwraps the backend's { success, message, data } envelope.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — always calls the real apps/api/src/employees/* backend.
// ─────────────────────────────────────────────────────────────────────────────

export async function listEmployees(query: EmployeeQuery = {}): Promise<Employee[]> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.department && query.department !== "all") params.set("department", query.department);
  if (query.status && query.status !== "all") params.set("status", query.status);
  const qs = params.toString();
  const raw = await unwrap<BackendEmployee[]>(apiClient.get(`/employees${qs ? `?${qs}` : ""}`));
  return raw.map(normalize);
}

export interface EmployeePageParams extends EmployeeQuery {
  page: number;
  limit: number;
}

/** One page of employees (server-side search, filters and paging). */
export async function listEmployeesPage(
  params: EmployeePageParams,
): Promise<{ items: Employee[]; total: number; pages: number }> {
  const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
  if (params.search) qs.set("search", params.search);
  if (params.department && params.department !== "all") qs.set("department", params.department);
  if (params.status && params.status !== "all") qs.set("status", params.status);
  const json = (await apiClient.get(`/employees?${qs.toString()}`)) as {
    data: BackendEmployee[];
    meta: { total: number; pages: number };
  };
  return { items: json.data.map(normalize), total: json.meta.total, pages: json.meta.pages };
}

/** Every employee matching a filter, fetched a page of 100 at a time (for CSV export). */
export async function listEmployeesAll(query: EmployeeQuery = {}): Promise<Employee[]> {
  const all: Employee[] = [];
  for (let page = 1; ; page++) {
    const result = await listEmployeesPage({ ...query, page, limit: 100 });
    all.push(...result.items);
    if (page >= result.pages || result.items.length === 0) return all;
  }
}

export async function getEmployee(id: number): Promise<Employee> {
  const raw = await unwrap<BackendEmployee>(apiClient.get(`/employees/${id}`));
  return normalize(raw);
}

export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  const raw = await unwrap<BackendEmployee>(apiClient.post("/employees", input));
  return normalize(raw);
}

export async function updateEmployee(id: number, input: Partial<EmployeeInput>): Promise<Employee> {
  const raw = await unwrap<BackendEmployee>(apiClient.patch(`/employees/${id}`, input));
  return normalize(raw);
}

export async function deleteEmployee(id: number): Promise<Employee> {
  const raw = await unwrap<BackendEmployee>(apiClient.del(`/employees/${id}`));
  return normalize(raw);
}

export async function deactivateEmployee(id: number): Promise<Employee> {
  const raw = await unwrap<BackendEmployee>(apiClient.patch(`/employees/${id}/deactivate`, {}));
  return normalize(raw);
}
