import { eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { budgetApprovalSteps, budgets, budgetStatusEnum } from "../../db/schema/finance.js";
import type { DecideBudgetApprovalInput } from "./types.js";

type BudgetStatus = (typeof budgetStatusEnum.enumValues)[number];

export const findByBudgetId = async (budgetId: number) => {
  return db
    .select()
    .from(budgetApprovalSteps)
    .where(eq(budgetApprovalSteps.budgetId, budgetId));
};

export const findAll = async () => {
  return db.select().from(budgetApprovalSteps);
};

export const insertStep = async (data: DecideBudgetApprovalInput) => {
  const [created] = await db
    .insert(budgetApprovalSteps)
    .values({
      budgetId: data.budgetId,
      stage: data.stage,
      decision: data.decision,
      actor: data.actor,
      comment: data.comment,
      decidedAt: new Date(),
    })
    .returning();
  return created;
};

// Decisions also move the budget's own status forward/back so the
// Overview tab's StatusBadge stays in sync with the approval pipeline.
export const setBudgetStatus = async (budgetId: number, status: BudgetStatus) => {
  await db
    .update(budgets)
    .set({ status, updatedAt: new Date() })
    .where(eq(budgets.id, budgetId));
};
