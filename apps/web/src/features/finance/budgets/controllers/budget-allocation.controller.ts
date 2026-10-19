import { BUDGET_CHART_COLORS } from "@/features/finance/budgets/constants/chart-colors";
import { useMemo } from "react";

export interface BudgetAllocation {
  id: number;
  budgetId: number;
  department: string;
  category: string;
  amount: number;
  consumed: number;
  status: string;
  createdAt: string | Date | null;
}

export interface AllocationChartItem {
  label: string;
  value: number;
  color?: string;
}

export function useBudgetAllocationController(allocations: BudgetAllocation[]) {
  const filtered = allocations;

  const byCategory = useMemo<AllocationChartItem[]>(() => {
    const map = new Map<string, number>();

    filtered.forEach((allocation) => {
      map.set(
        allocation.category,
        (map.get(allocation.category) ?? 0) + allocation.amount,
      );
    });

    return Array.from(map.entries()).map(([label, value], index) => ({
      label,
      value,
      color: BUDGET_CHART_COLORS[index % BUDGET_CHART_COLORS.length],
    }));
  }, [filtered]);

  const byDepartment = useMemo<AllocationChartItem[]>(() => {
    const map = new Map<string, number>();

    filtered.forEach((allocation) => {
      map.set(
        allocation.department,
        (map.get(allocation.department) ?? 0) + allocation.amount,
      );
    });

    return Array.from(map.entries()).map(([label, value]) => ({
      label,
      value,
    }));
  }, [filtered]);

  return {
    filtered,
    byCategory,
    byDepartment,
  };
}
