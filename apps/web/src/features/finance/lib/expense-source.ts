import type { Expense } from "../types/finance.types";

export type ExpenseSource =
  | { kind: "purchase-order"; label: string }
  | { kind: "retired-claim"; label: string }
  | { kind: "manual"; label: string };

/**
 * Where an expense row came from, for the ledger's Source column. Rows booked from a
 * paid reimbursement claim (the feature was removed) keep their sourceType and show a
 * plain label, with no link: there is no claims page to open.
 */
export function expenseSource(e: Pick<Expense, "sourceType" | "sourceId">): ExpenseSource {
  if (e.sourceType === "purchase-order" && e.sourceId) return { kind: "purchase-order", label: e.sourceId };
  if (e.sourceType === "reimbursement") return { kind: "retired-claim", label: "Reimbursement (retired)" };
  return { kind: "manual", label: "Manual" };
}
