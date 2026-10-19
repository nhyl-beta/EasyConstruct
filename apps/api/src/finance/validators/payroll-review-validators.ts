import { z } from "zod";
import { REJECTION_REASONS } from "../../payroll/types.js";

// There is intentionally no create schema: batches only come from the payroll
// generator, never from typed-in totals.

export const decidePayrollBatchSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    reasonCode: z.enum(REJECTION_REASONS).optional(),
    comment: z.string().max(2000).optional(),
    // Accepted for backward compatibility; the reviewer is always the
    // authenticated user, never this value.
    reviewedBy: z.string().max(255).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision !== "rejected") return;
    if (!v.reasonCode)
      ctx.addIssue({ code: "custom", path: ["reasonCode"], message: "A rejection reason is required" });
    else if (v.reasonCode === "other" && !v.comment?.trim())
      ctx.addIssue({ code: "custom", path: ["comment"], message: "A comment is required when the reason is Other" });
  });
