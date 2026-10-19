// apps/api/src/finance/expenses/decision.ts
//
// Pure rules for approving or rejecting an expense, kept apart from the
// database so each guard is unit-tested.
import { ConflictError } from "../../utils/errors.js";

export type ExpenseDecision = "approved" | "rejected";

/** Only a pending expense can be decided; anything else is a 409 that changes nothing. */
export function assertDecidable(id: string, currentStatus: string): void {
  if (currentStatus !== "pending") {
    throw new ConflictError(`Expense ${id} is already ${currentStatus}; only a pending expense can be decided`);
  }
}

export const NO_BUDGET_WARNING =
  "No budget line for this category. The amount is not counted against any budget.";

/** What the API tells the caller about the budget after an approval. */
export function budgetOutcome(matched: boolean): { budgetMatched: boolean; warning: string | null } {
  return { budgetMatched: matched, warning: matched ? null : NO_BUDGET_WARNING };
}
