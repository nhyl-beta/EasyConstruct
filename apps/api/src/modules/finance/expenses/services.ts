import { NotFoundError, ValidationError } from "../../../core/utils/errors.js";
import { assertProjectWritable } from "../../projects/index.js";
import { expensesRepository, EXPENSE_SORT_COLUMNS, defaultExpenseOrder } from "./repository.js";
import { expenses as expensesTable } from "../../../core/db/schema/finance.js";
import { orderByFor, paginate, type PageRequest } from "../../../core/utils/pagination.js";
import type { CreateExpenseInput, ListExpensesQuery } from "./types.js";
import { scoreExpense } from "./anomaly.js";
import { FEATURES } from "../../../core/config/features.js";
import { db } from "../../../core/db/connection.js";
import { assertDecidable, budgetOutcome } from "./decision.js";
import { applyApprovedSpend } from "../purchasing/booking.js";
import { resolveActiveCategory } from "../categories/service.js";

/** Scores one expense against every other expense (decision support; never blocks). */
async function scoreAndStore(id: string) {
  const all = await expensesRepository.findAllForAnomaly();
  const candidate = all.find((e) => e.id === id);
  if (!candidate) return;
  const { score, reasons } = scoreExpense(candidate, all);
  await expensesRepository.setAnomaly(id, score, reasons.length ? reasons.join("; ") : null);
}

/**
 * After a payment created an expense: score it and attach `extraReasons`
 * (invoice variance). Runs after the payment committed, and a
 * failure here must never fail or undo the payment.
 */
export async function annotateSpendExpense(id: string, extraReasons: string[]): Promise<void> {
  try {
    if (FEATURES.ai) await scoreAndStore(id);
    if (extraReasons.length === 0) return;
    const row = await expensesRepository.findById(id);
    if (!row) return;
    const reasons = [row.anomalyReason, ...extraReasons].filter(Boolean).join("; ");
    await expensesRepository.setAnomaly(id, Math.max(row.anomalyScore ?? 0, 0.4), reasons);
  } catch (e) {
    console.error("[expenses] annotating a paid expense failed", e);
  }
}

export const expensesService = {
  async list(queryParams: ListExpensesQuery) {
    return expensesRepository.findMany(queryParams);
  },

  /** The same list with its total: the page window comes from the shared pagination request. */
  async listPage(params: Pick<ListExpensesQuery, "query" | "category" | "codes">, request: PageRequest, withExtras = false) {
    const [page, extras] = await Promise.all([
      paginate(
        request,
        () => expensesRepository.countMany(params),
        (window) =>
          expensesRepository.findPage(
            params,
            window,
            orderByFor(request, EXPENSE_SORT_COLUMNS, defaultExpenseOrder, expensesTable.id),
          ),
      ),
      // Spend per category and the flagged expenses across the whole filter set (the Analytics tab).
      withExtras
        ? Promise.all([expensesRepository.breakdown(params), expensesRepository.anomalies(params, 50)])
        : Promise.resolve(undefined),
    ]);
    return extras ? { items: page.items, meta: { ...page.meta, breakdown: extras[0], anomalies: extras[1] } } : page;
  },

  async create(input: CreateExpenseInput) {
    if (input.amount <= 0) {
      throw new ValidationError("Amount must be greater than zero");
    }
    // Stored in the managed list's casing; unknown or retired categories are refused.
    const category = await resolveActiveCategory(input.category);
    await assertProjectWritable(input.project);
    const created = await expensesRepository.create({ ...input, category });
    if (!FEATURES.ai || !created) return created;
    // Rule-based anomaly check; a failure here must never fail the create.
    await scoreAndStore(created.id).catch((e) => console.error("[expenses] anomaly scoring failed", e));
    return (await expensesRepository.findById(created.id)) ?? created;
  },

  /** Re-scores every expense (e.g. after rows were added by a seed or import). Admin / Finance. */
  async rescoreAll() {
    if (!FEATURES.ai) return { scored: 0, flagged: 0, enabled: false };
    const all = await expensesRepository.findAllForAnomaly();
    let flagged = 0;
    for (const e of all) {
      const { score, reasons } = scoreExpense(e, all);
      await expensesRepository.setAnomaly(e.id, score, reasons.length ? reasons.join("; ") : null);
      if (score >= 0.3) flagged += 1;
    }
    return { scored: all.length, flagged, enabled: true };
  },

  /**
   * Approving is real spend: in ONE transaction the expense leaves "pending",
   * the matching budget line (project + category) grows by the amount with an
   * atomic `actual = actual + amount`, and that month's cash flow outflow is
   * recomputed. A second approval is a 409 and changes nothing. With no
   * matching budget line the expense is still approved, and the caller is told.
   */
  async approve(id: string) {
    const existing = await expensesRepository.findById(id);
    if (!existing) throw new NotFoundError("Expense", id);
    await assertProjectWritable(existing.project);

    const { row, matched } = await db.transaction(async (tx) => {
      const decided = await expensesRepository.decideIfPending(id, "approved", tx);
      if (!decided) {
        const current = await expensesRepository.findById(id);
        if (!current) throw new NotFoundError("Expense", id);
        assertDecidable(id, current.status);
        throw new NotFoundError("Expense", id);
      }
      // Shared with order and claim payment: one place books actual + cash flow.
      const { matched } = await applyApprovedSpend(tx, {
        project: decided.project,
        category: decided.category,
        amount: decided.amount,
        at: decided.submittedAt,
      });
      return { row: decided, matched };
    });
    return { ...row, ...budgetOutcome(matched) };
  },

  async reject(id: string) {
    const existing = await expensesRepository.findById(id);
    if (!existing) throw new NotFoundError("Expense", id);
    await assertProjectWritable(existing.project);
    // Rejecting never touches a budget or the cash flow.
    const row = await expensesRepository.decideIfPending(id, "rejected");
    if (!row) {
      const current = await expensesRepository.findById(id);
      if (!current) throw new NotFoundError("Expense", id);
      assertDecidable(id, current.status);
      throw new NotFoundError("Expense", id);
    }
    return row;
  },
};