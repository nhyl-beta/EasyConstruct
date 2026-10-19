// apps/web/src/features/employees/hooks/use-my-employee.ts — NEW (replaces the email-guessing TODO)
import { useEffect, useState } from "react";
import { employeesRepository, type MyEmployeeRecord } from "../repositories/employees.repository";

export function useMyEmployee() {
  const [employee, setEmployee] = useState<MyEmployeeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    employeesRepository
      .me()
      .then((res) => { if (!cancelled) setEmployee(res.data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "No linked employee record"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { employee, employeeId: employee?.employeeId ?? null, loading, error };
}