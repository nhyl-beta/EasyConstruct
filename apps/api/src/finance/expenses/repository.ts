import { and, desc, eq, gte, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { countRows, selectPage } from "../../core/db/paged.js";
import type { ExpenseDecision } from "./decision.js";
import type { ExpenseLike } from "./anomaly.js";

import { db } from "../../core/db/connection.js";
import { expenses } from "../../core/db/schema/finance.js";
import { nextId } from "../purchasing/ids.js";

import type { CreateExpenseInput, ListExpensesQuery } from "./types.js";

const expenseConditions = ({ query, category, codes }: Pick<ListExpensesQuery, "query" | "category" | "codes">) => {
  const conditions = [];
  if (codes) conditions.push(codes.length ? inArray(expenses.project, codes) : sql`false`);
  if (query) {
    conditions.push(
      or(ilike(expenses.vendor, `%${query}%`), ilike(expenses.id, `%${query}%`)),
    );
  }
  if (category && category !== "all") {
    conditions.push(eq(expenses.category, category));
  }
  return conditions;
};

export const EXPENSE_SORT_COLUMNS = {
  submittedAt: expenses.submittedAt,
  vendor: expenses.vendor,
  project: expenses.project,
  category: expenses.category,
  amount: expenses.amount,
  status: expenses.status,
} as const;

export const defaultExpenseOrder = [desc(expenses.submittedAt)];

export const expensesRepository = {
  async countMany(params: Pick<ListExpensesQuery, "query" | "category" | "codes">) {
    const conditions = expenseConditions(params);
    return countRows(expenses, conditions.length ? and(...conditions) : undefined);
  },

  /** Spend per category over a filter set (first appearance = newest expense first, like the list). */
  async breakdown(params: Pick<ListExpensesQuery, "query" | "category" | "codes">) {
    const conditions = expenseConditions(params);
    const rows = await db
      .select({
        category: expenses.category,
        amount: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
      })
      .from(expenses)
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(expenses.category)
      .orderBy(desc(sql`max(${expenses.submittedAt})`));
    return rows.map((r) => ({ category: r.category, amount: Number(r.amount) }));
  },

  /** Expenses the anomaly rules flagged (score >= 0.4) within a filter set, newest first. */
  async anomalies(params: Pick<ListExpensesQuery, "query" | "category" | "codes">, limit: number) {
    const conditions = [...expenseConditions(params), gte(expenses.anomalyScore, 0.4)];
    return db
      .select()
      .from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.submittedAt))
      .limit(limit);
  },

  async findPage(
    params: Pick<ListExpensesQuery, "query" | "category" | "codes">,
    window: { limit: number; offset: number },
    orderBy: SQL[],
  ) {
    const conditions = expenseConditions(params);
    return selectPage(expenses, conditions.length ? and(...conditions) : undefined, orderBy, window);
  },

  async findMany({
    query,
    category,
    page = 1,
    pageSize = 20,
  }: ListExpensesQuery) {
    const conditions = [];

    if (query) {
      conditions.push(
        or(
          ilike(expenses.vendor, `%${query}%`),
          ilike(expenses.id, `%${query}%`),
        ),
      );
    }
    if (category && category !== "all") {
      conditions.push(eq(expenses.category, category));
    }

    const whereClause = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(expenses)
      .where(whereClause)
      .orderBy(desc(expenses.submittedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return rows;
  },

  async findById(id: string) {
    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    return row ?? null;
  },

  async create(input: CreateExpenseInput) {
    const id = await nextId("EXP", db);
    const [row] = await db
      .insert(expenses)
      .values({ id, ...input, amount: input.amount, status: "pending" })
      .returning();
    return row;
  },

  /**
   * An expense that is already approved because a payment created it
   * (a purchase order). (source_type, source_id) is unique, so
   * paying twice cannot produce a second row: the insert conflicts and nothing
   * is returned.
   */
  async createApprovedFromSource(
    exec: Pick<typeof db, "insert" | "execute">,
    input: {
      vendor: string;
      project: string;
      category: string;
      amount: number;
      sourceType: "purchase-order";
      sourceId: string;
      receiptUrl?: string | null;
    },
  ) {
    const id = await nextId("EXP", exec);
    const [row] = await exec
      .insert(expenses)
      .values({
        id,
        vendor: input.vendor,
        project: input.project,
        category: input.category,
        amount: input.amount,
        status: "approved",
        receiptUrl: input.receiptUrl ?? null,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      })
      .onConflictDoNothing()
      .returning();
    return row;
  },

  /** Every expense as the anomaly rules see it (amount, vendor, project, category, date, status). */
  async findAllForAnomaly(): Promise<ExpenseLike[]> {
    const rows = await db.select().from(expenses);
    return rows.map((r) => ({ id: r.id, vendor: r.vendor, project: r.project, category: r.category, amount: Number(r.amount), submittedAt: r.submittedAt, status: r.status }));
  },

  async setAnomaly(id: string, score: number, reason: string | null) {
    await db.update(expenses).set({ anomalyScore: score, anomalyReason: reason }).where(eq(expenses.id, id));
  },

  /**
   * Moves a PENDING expense to its decision in one conditional statement, so two
   * concurrent decisions cannot both win. Undefined when it was not pending.
   */
  async decideIfPending(id: string, status: ExpenseDecision, exec: Pick<typeof db, "update"> = db) {
    const [row] = await exec
      .update(expenses)
      .set({ status })
      .where(and(eq(expenses.id, id), eq(expenses.status, "pending")))
      .returning();
    return row;
  },

  // H4: Finance's Project Closeout sign-off is refused while a project still
  // has unresolved expenses — findMany has no project filter at all (its
  // callers are all a global, unfiltered Finance list), so this is a
  // dedicated query rather than overloading that one.
  async hasPending(project: string) {
    const [row] = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.project, project), eq(expenses.status, "pending")))
      .limit(1);
    return row != null;
  },
};
