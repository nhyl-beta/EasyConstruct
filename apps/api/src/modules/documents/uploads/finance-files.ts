// Finance files are not open to every signed-in role: a receipt or delivery receipt belongs to a
// finance record, and opening it follows the same rule as reading that record (finance/access.ts).
import { eq, sql } from "drizzle-orm";
import { db } from "../../../core/db/connection.js";
import { expenses, procurementOrders, reimbursements } from "../../../core/db/schema/finance.js";
import { canReadFinanceFile, type FinanceFileKind } from "../../finance/index.js";
import { assertProjectVisible } from "../../projects/index.js";
import { ForbiddenError } from "../../../core/utils/errors.js";

interface FinanceFileOwner {
  kind: FinanceFileKind;
  project: string | null;
}

/** The finance record a stored url belongs to, if any. Files that belong to no finance record are not restricted here. */
export async function findFinanceFileOwner(url: string): Promise<FinanceFileOwner | null> {
  const [expense] = await db.select({ project: expenses.project }).from(expenses).where(eq(expenses.receiptUrl, url)).limit(1);
  if (expense) return { kind: "expense-receipt", project: expense.project };

  const [order] = await db
    .select({ project: procurementOrders.project })
    .from(procurementOrders)
    .where(eq(procurementOrders.deliveryReceiptUrl, url))
    .limit(1);
  if (order) return { kind: "delivery-receipt", project: order.project };

  // Receipts attached to claims from before that feature was removed (the table is retained).
  const [claim] = await db
    .select({ project: reimbursements.project })
    .from(reimbursements)
    .where(sql`${reimbursements.attachments} @> ${JSON.stringify([{ url }])}::jsonb`)
    .limit(1);
  if (claim) return { kind: "expense-receipt", project: claim.project };

  return null;
}

/** 403 when the file belongs to a finance record this caller may not read. */
export async function assertCanOpenFile(
  url: string,
  auth: { id: number; role: string; name: string } | undefined,
): Promise<void> {
  if (!auth) return;
  const owner = await findFinanceFileOwner(url);
  if (!owner) return;
  if (!canReadFinanceFile(auth.role, owner.kind)) {
    throw new ForbiddenError("You do not have access to finance files");
  }
  // A Project Manager only opens files of the projects they manage.
  if (auth.role === "project-manager") await assertProjectVisible(auth, owner.project, "finance files");
}
