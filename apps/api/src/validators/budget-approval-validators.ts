import { z } from "zod";
import { APPROVAL_STAGES } from "../finance/budget-approval-steps/types.js";

export const decideBudgetApprovalSchema = z.object({
  budgetId: z.number().int().positive(),
  stage: z.enum(APPROVAL_STAGES),
  decision: z.enum(["approved", "rejected", "returned"]),
  actor: z.string().min(2).max(255),
  comment: z.string().max(2000).optional(),
});

export type DecideBudgetApprovalInput = z.infer<
  typeof decideBudgetApprovalSchema
>;
