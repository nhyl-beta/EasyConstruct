import { apiClient } from "@/services/api.client";

export interface MyEmployeeRecord {
  id: number;
  employeeId: string;
  name: string;
  site: string;
}

export const employeesRepository = {
  me: (): Promise<{ data: MyEmployeeRecord }> => apiClient.get("/employees/me"),
};