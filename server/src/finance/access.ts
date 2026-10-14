// Who may READ finance data (pure). Writes keep their own per-route role lists.
//
// Default policy (needs the owner's confirmation, see the pull request): finance reads go to the
// roles with a finance function. Site Personnel and Consultant have none, so they get 403 on the
// finance lists, except the specific records they create or confirm (purchase requests, delivery
// confirmation on procurement orders), which keep their own routes.

/** Company-wide finance views (cash flow, profitability, summary). */
export const FINANCE_COMPANY_READERS = ["finance-manager", "owner", "admin", "it-designer"] as const;

/**
 * Budget lines and the expense ledger: the company-wide readers, plus the Project Manager, who
 * only gets the rows of the projects they manage (the controllers filter them).
 */
export const FINANCE_PROJECT_READERS = [...FINANCE_COMPANY_READERS, "project-manager"] as const;

/** Roles that confirm a delivery and so may open that order's delivery receipt. */
export const DELIVERY_RECEIPT_READERS = ["engineer", "site-personnel"] as const;

export type FinanceFileKind = "expense-receipt" | "delivery-receipt";

/** May this role open a stored file that belongs to a finance record of this kind? */
export function canReadFinanceFile(role: string, kind: FinanceFileKind): boolean {
  if ((FINANCE_PROJECT_READERS as readonly string[]).includes(role)) return true;
  return kind === "delivery-receipt" && (DELIVERY_RECEIPT_READERS as readonly string[]).includes(role);
}
