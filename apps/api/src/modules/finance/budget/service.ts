import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { eq } from "drizzle-orm";
import { NotFoundError, ValidationError } from "../../../core/utils/errors.js";
import { assertProjectWritable, refreshProjectProgress } from "../../projects/index.js";
import { resolveActiveCategory, resolveCategoryChange } from "../categories/service.js";
import * as repo from "./repository.js";
import type {
  BudgetFilters,
  CreateBudgetInput,
  UpdateBudgetInput,
} from "./types.js";

export const getAll = async (filters: BudgetFilters) => repo.findAll(filters);

export const getById = async (id: number) => {
  const budget = await repo.findById(id);
  if (!budget) throw new NotFoundError("Budget", String(id));
  return budget;
};

export const create = async (input: CreateBudgetInput) => {
  const [project] = await db.select().from(projects).where(eq(projects.code, input.project));
  if (!project) {
    throw new ValidationError(`No project found with code "${input.project}"`);
  }
  await assertProjectWritable(input.project);
  // Stored in the managed list's casing; unknown or retired categories are refused.
  const category = await resolveActiveCategory(input.category);
  const created = await repo.create({ ...input, category });
  if (!created) throw new Error("Failed to create budget");
  await refreshProjectProgress(created.project);
  return created;
};

export const update = async (id: number, input: UpdateBudgetInput) => {
  const existing = await getById(id);
  await assertProjectWritable(existing.project);
  // Checked only when the category changes: a line whose category was retired
  // since stays editable for its other fields.
  const { category: nextCategory, ...rest } = input;
  const category = nextCategory === undefined ? null : await resolveCategoryChange(existing.category, nextCategory);
  const patch = category === null ? rest : { ...rest, category };
  const updated = await repo.update(id, patch);
  if (!updated) throw new NotFoundError("Budget", String(id));
  await refreshProjectProgress(updated.project);
  return updated;
};

export const remove = async (id: number) => {
  const existing = await getById(id);
  const deleted = await repo.remove(id);
  if (!deleted) throw new NotFoundError("Budget", String(id));
  await refreshProjectProgress(existing.project);
  return deleted;
};
