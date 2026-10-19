import { z } from "zod";

export const createDesignReviewSchema = z.object({
  code: z.string().min(2).max(20),
  designId: z.number().int().positive(),
  discipline: z.string().max(50).optional(),
  priority: z.string().max(20).optional(),
  reviewers: z.string().optional(),
  requestedBy: z.string().min(2).max(100),
  dueDate: z.string().max(20).optional(),
});
export const decideDesignReviewSchema = z.object({
  decision: z.enum(["Approved", "Rejected", "Changes Requested"]),
});
