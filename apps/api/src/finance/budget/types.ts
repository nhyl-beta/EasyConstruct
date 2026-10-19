import type { InferSelectModel } from "drizzle-orm";
import { budgets } from "../../db/schema/finance.js";

export type BudgetStatus = InferSelectModel<typeof budgets>["status"];

export interface BudgetRecord {
  id: number;
  project: string;
  category: string;
  owner: string;

  planned: number;
  committed: number;
  spent: number;

  fiscalYear: string;
  status: BudgetStatus;

  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBudgetInput {
  project: string;
  category: string;
  owner: string;

  planned: number;
  committed?: number;
  spent?: number;

  fiscalYear: string;

  status?: BudgetStatus;
}

export interface UpdateBudgetInput extends Partial<CreateBudgetInput> {}

export interface BudgetFilters {
  fiscalYear?: string;
  status?: BudgetStatus | "all";
  search?: string;
}
