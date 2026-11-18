import { apiClient } from "@/services/api.client";

export interface MyEmployeeRecord {
  id: number;
  employeeId: string;
  name: string;
  site: string;
}

export interface EmployeeLookupResult {
  employeeId: string;
  name: string;
}

export interface Department {
  id: number;
  name: string;
}

export const employeesRepository = {
  departments: (): Promise<{ data: Department[] }> => apiClient.get("/employees/departments"),
  addDepartment: (name: string): Promise<{ data: Department }> => apiClient.post("/employees/departments", { name }),
  removeDepartment: (id: number): Promise<unknown> => apiClient.del(`/employees/departments/${id}`),
  me: (): Promise<{ data: MyEmployeeRecord }> => apiClient.get("/employees/me"),
  lookup: (q: string): Promise<{ data: EmployeeLookupResult[] }> =>
    apiClient.get(`/employees/lookup?q=${encodeURIComponent(q)}`),
};