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

export const employeesRepository = {
  me: (): Promise<{ data: MyEmployeeRecord }> => apiClient.get("/employees/me"),
  lookup: (q: string): Promise<{ data: EmployeeLookupResult[] }> =>
    apiClient.get(`/employees/lookup?q=${encodeURIComponent(q)}`),
};