// The HR-managed department list (replaces the hardcoded one). Names only for pickers; ids for removal.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { employeesRepository } from "../repositories/employees.repository";

export function useDepartments() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.employees.departments,
    queryFn: async () => (await employeesRepository.departments()).data,
    staleTime: 60_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: qk.employees.departments });
  return {
    departments: query.data ?? [],
    add: async (name: string) => { await employeesRepository.addDepartment(name); await refresh(); },
    remove: async (id: number) => { await employeesRepository.removeDepartment(id); await refresh(); },
  };
}
