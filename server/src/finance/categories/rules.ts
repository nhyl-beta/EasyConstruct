// Pure rules for the managed expense-category list (no database).
import { ConflictError, ValidationError } from "../../utils/errors.js";

export const NAME_MIN = 2;
export const NAME_MAX = 64;

export interface CategoryLike {
  id: number;
  name: string;
  isActive: boolean;
  isSystem: boolean;
}

/** Row counts per table that hold a category as free text. */
export interface CategoryUsage {
  budgets: number;
  expenses: number;
  purchaseRequests: number;
  reimbursements: number;
  procurementOrders: number;
  budgetAllocations: number;
}

export const USAGE_LABELS: Record<keyof CategoryUsage, [singular: string, plural: string]> = {
  budgets: ["budget line", "budget lines"],
  expenses: ["expense", "expenses"],
  purchaseRequests: ["purchase request", "purchase requests"],
  reimbursements: ["reimbursement claim", "reimbursement claims"],
  procurementOrders: ["procurement order", "procurement orders"],
  budgetAllocations: ["budget allocation", "budget allocations"],
};

export const emptyUsage = (): CategoryUsage => ({
  budgets: 0,
  expenses: 0,
  purchaseRequests: 0,
  reimbursements: 0,
  procurementOrders: 0,
  budgetAllocations: 0,
});

export const totalUsage = (u: CategoryUsage): number => Object.values(u).reduce((a, b) => a + b, 0);

/** "3 expenses, 1 budget line" - only the non-zero parts. */
export const describeUsage = (u: CategoryUsage): string =>
  (Object.keys(USAGE_LABELS) as (keyof CategoryUsage)[])
    .filter((k) => u[k] > 0)
    .map((k) => `${u[k]} ${USAGE_LABELS[k][u[k] === 1 ? 0 : 1]}`)
    .join(", ");

/** The key two names are compared by: case-insensitive, spaces collapsed. */
export const nameKey = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Trim, collapse inner spaces, and enforce 2-64 characters. */
export function normalizeName(input: string): string {
  const name = String(input ?? "").trim().replace(/\s+/g, " ");
  if (name.length < NAME_MIN) throw new ValidationError(`Category name must be at least ${NAME_MIN} characters`);
  if (name.length > NAME_MAX) throw new ValidationError(`Category name must be at most ${NAME_MAX} characters`);
  return name;
}

/**
 * A new name must not collide with another category that differs only by case
 * (or spacing). `exceptId` lets a category keep its own name when it is renamed
 * to a different casing of itself.
 */
export function assertNameFree(list: readonly CategoryLike[], name: string, exceptId?: number): void {
  const key = nameKey(name);
  const clash = list.find((c) => c.id !== exceptId && nameKey(c.name) === key);
  if (clash) throw new ConflictError(`A category named "${clash.name}" already exists`);
}

/** The canonical stored name of the ACTIVE category matching `input` (any casing), or null. */
export function findActive(list: readonly CategoryLike[], input: string): string | null {
  const key = nameKey(String(input ?? ""));
  if (!key) return null;
  const hit = list.find((c) => c.isActive && nameKey(c.name) === key);
  return hit ? hit.name : null;
}

/** System categories keep their name; a used category keeps its name too (retire it and add a new one). */
export function assertRenamable(category: CategoryLike, usage: CategoryUsage): void {
  if (category.isSystem) throw new ConflictError(`"${category.name}" is a system category and cannot be renamed`);
  const total = totalUsage(usage);
  if (total > 0) {
    throw new ConflictError(
      `"${category.name}" is used by ${describeUsage(usage)} and cannot be renamed. Retire it and add a new category instead.`,
      { usage },
    );
  }
}

export function assertRetirable(category: CategoryLike): void {
  if (category.isSystem) throw new ConflictError(`"${category.name}" is a system category and cannot be retired`);
}
