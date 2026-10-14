import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/connection.js";
import {
  budgetAllocations,
  budgets,
  expenseCategories,
  expenses,
  procurementOrders,
  purchaseRequests,
} from "../../db/schema/finance.js";
import { emptyUsage, nameKey, type CategoryUsage } from "./rules.js";

export type CategoryRow = typeof expenseCategories.$inferSelect;
type Read = Pick<typeof db, "select">;

// The five tables that hold a category as free text.
const USAGE_SOURCES = [
  ["budgets", budgets.category, budgets],
  ["expenses", expenses.category, expenses],
  ["purchaseRequests", purchaseRequests.category, purchaseRequests],
  ["procurementOrders", procurementOrders.category, procurementOrders],
  ["budgetAllocations", budgetAllocations.category, budgetAllocations],
] as const;

export const categoriesRepository = {
  async findAll(opts: { activeOnly?: boolean } = {}, exec: Read = db): Promise<CategoryRow[]> {
    return exec
      .select()
      .from(expenseCategories)
      .where(opts.activeOnly ? eq(expenseCategories.isActive, true) : undefined)
      .orderBy(asc(expenseCategories.sortOrder), asc(expenseCategories.name));
  },

  async findById(id: number, exec: Read = db): Promise<CategoryRow | null> {
    const [row] = await exec.select().from(expenseCategories).where(eq(expenseCategories.id, id));
    return row ?? null;
  },

  async insert(values: { name: string; sortOrder: number; createdBy: string }): Promise<CategoryRow | null> {
    const [row] = await db.insert(expenseCategories).values(values).onConflictDoNothing().returning();
    return row ?? null;
  },

  async nextSortOrder(): Promise<number> {
    const [r] = await db
      .select({ max: sql<number>`coalesce(max(${expenseCategories.sortOrder}), 0)` })
      .from(expenseCategories);
    return Number(r?.max ?? 0) + 10;
  },

  /** Conditional update: applies only while the row is still in the state the caller checked. */
  async updateIf(
    id: number,
    guard: { isActive?: boolean; name?: string },
    values: Partial<Pick<CategoryRow, "name" | "isActive" | "sortOrder">>,
  ): Promise<CategoryRow | null> {
    const where = [eq(expenseCategories.id, id)];
    if (guard.isActive !== undefined) where.push(eq(expenseCategories.isActive, guard.isActive));
    if (guard.name !== undefined) where.push(eq(expenseCategories.name, guard.name));
    const [row] = await db
      .update(expenseCategories)
      .set({ ...values, updatedAt: new Date() })
      .where(and(...where))
      .returning();
    return row ?? null;
  },

  /**
   * Row counts per category across the six tables: one grouped query per
   * table. Keyed by the comparison key (case-insensitive), so an old record
   * stored as "materials" still counts for "Materials".
   */
  async usageByCategory(exec: Read = db): Promise<Map<string, CategoryUsage>> {
    const out = new Map<string, CategoryUsage>();
    const results = await Promise.all(
      USAGE_SOURCES.map(([, column, table]) =>
        exec.select({ category: column, n: sql<number>`count(*)::int` }).from(table).groupBy(column),
      ),
    );
    results.forEach((rows, i) => {
      const key = USAGE_SOURCES[i]![0];
      for (const r of rows) {
        if (!r.category) continue;
        const k = nameKey(r.category);
        const u = out.get(k) ?? emptyUsage();
        u[key] += Number(r.n);
        out.set(k, u);
      }
    });
    return out;
  },
};
