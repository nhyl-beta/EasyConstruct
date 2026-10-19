// apps/web/src/features/budgets/hooks/useBudgets.ts
import { useBudgetsController } from "../controllers/budget.controllers";

export const useBudgets = (initial = "") => {
  // Thin alias so future Refine integration (useTable) can swap
  // implementations in one place, matching useProjects.ts.
  return useBudgetsController(initial);
};