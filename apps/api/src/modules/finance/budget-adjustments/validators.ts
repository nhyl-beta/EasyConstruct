import { z } from "zod";

export const createBudgetAdjustmentSchema = z.object({
  budgetId: z.number().int().positive(),
  kind: z.enum(["increase", "decrease", "transfer", "emergency"]),
  originalAmount: z.number().nonnegative(),
  adjustmentAmount: z.number(),
  newAmount: z.number().nonnegative(),
  reason: z.string().min(3),
  requestedBy: z.string().min(2).max(255),
  status: z.string().optional().default("draft"),
});

export const updateBudgetAdjustmentSchema = createBudgetAdjustmentSchema.partial().extend({
  approvedBy: z.string().max(255).optional(),
});

export type CreateBudgetAdjustmentInput = z.infer<typeof createBudgetAdjustmentSchema>;
export type UpdateBudgetAdjustmentInput = z.infer<typeof updateBudgetAdjustmentSchema>;