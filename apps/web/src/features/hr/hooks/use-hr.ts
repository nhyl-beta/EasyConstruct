import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/query-keys";
import { STALE } from "@/lib/query-client";

import {
  createEmployee,
  deleteEmployee,
  deactivateEmployee,
  listEmployeesAll,
  updateEmployee,
} from "../hr-api";

import type { Employee, EmployeeInput, EmployeeQuery } from "../types";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "An unexpected error occurred.";
}

/**
 * Employees as a shared lookup (department pickers, the quick-search palette):
 * one cached query, fetched 100 per request. The Employees table pages through
 * the server instead (hr-employees.tsx); writes here invalidate the employee
 * queries, which refetch on their own.
 */
export function useEmployees(filters: EmployeeQuery = {}) {
  const { search, department, status } = filters;
  const query = useQuery({
    queryKey: qk.employees.list({ lookup: true, search, department, status }),
    queryFn: () => listEmployeesAll({ search, department, status }),
    staleTime: STALE.list,
  });
  const [actionError, setActionError] = useState<string | null>(null);
  const data: Employee[] = query.data ?? [];

  const act = useCallback(async <T,>(run: () => Promise<T>): Promise<T> => {
    setActionError(null);
    try {
      return await run();
    } catch (err) {
      setActionError(getErrorMessage(err));
      throw err;
    }
  }, []);

  return {
    data,
    employees: data,
    loading: query.isLoading,
    error: actionError ?? (query.error ? getErrorMessage(query.error) : null),
    refresh: () => query.refetch(),
    create: (input: EmployeeInput) => act(() => createEmployee(input)),
    update: (id: number, input: Partial<EmployeeInput>) => act(() => updateEmployee(id, input)),
    remove: (id: number) => act(() => deleteEmployee(id)),
    deactivate: (id: number) => act(() => deactivateEmployee(id)),
  };
}
