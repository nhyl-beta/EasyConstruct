import { z } from "zod";

export const createMilestoneSchema = z.object({
  projectCode: z.string().min(1).max(50),
  title: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
  // ISO date string ("YYYY-MM-DD") — an ESTIMATE at draft time, checked
  // loosely rather than parsed, matching projects.due's own convention.
  estimatedCompletionDate: z.string().max(20).optional(),
});

// Status is intentionally the only way a milestone leaves "draft" — creation
// (createMilestoneSchema) never accepts one.
export const updateMilestoneSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(["draft", "active", "at-risk", "completed", "cancelled"]).optional(),
  estimatedCompletionDate: z.string().max(20).optional(),
});

export const createMilestoneLinkSchema = z.object({
  linkType: z.enum(["requirement", "document", "budget", "task"]),
  linkId: z.number().int().positive(),
});
