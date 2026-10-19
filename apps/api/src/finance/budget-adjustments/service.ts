import { NotFoundError } from "../../utils/errors.js";
import * as repo from "./repository.js";
import type {
  BudgetAdjustmentFilters,
  CreateBudgetAdjustmentInput,
  UpdateBudgetAdjustmentInput,
} from "./types.js";

export const getAll = async (filters: BudgetAdjustmentFilters) =>
  repo.findAll(filters);

export const getById = async (id: number) => {
  const adjustment = await repo.findById(id);
  if (!adjustment) throw new NotFoundError("Budget adjustment", String(id));
  return adjustment;
};

export const create = async (input: CreateBudgetAdjustmentInput) =>
  repo.create(input);

export const update = async (
  id: number,
  input: UpdateBudgetAdjustmentInput,
) => {
  await getById(id);
  const updated = await repo.update(id, input);
  if (!updated) throw new NotFoundError("Budget adjustment", String(id));
  return updated;
};

export const remove = async (id: number) => {
  await getById(id);
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError("Budget adjustment", String(id));
  return deleted;
};
