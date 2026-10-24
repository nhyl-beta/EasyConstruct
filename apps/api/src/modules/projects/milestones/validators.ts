import { z } from "zod";
import { todayManila } from "../../../core/utils/dates.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const MILESTONE_DATE_PAST_MESSAGE = "Milestone date can't be in the past";

/**
 * Why a milestone date is unacceptable, or null if it is fine. Today (Manila)
 * is allowed. "Today" is the Manila date, not the server's UTC date: between
 * 00:00 and 08:00 Manila time the UTC date is still yesterday and would accept
 * a day that has already passed locally.
 */
export const milestoneDateIssue = (date: string, now: Date = new Date()): string | null => {
  if (!ISO_DATE.test(date)) return "Use a YYYY-MM-DD date";
  return date < todayManila(now) ? MILESTONE_DATE_PAST_MESSAGE : null;
};

/**
 * Re-dating rule for an update: only a date that is changing to a past value
 * is refused. Re-sending the stored (possibly past) date is fine.
 */
export const redateIssue = (
  next: string | undefined,
  stored: string | null | undefined,
  now: Date = new Date(),
): string | null => {
  if (next === undefined || next === stored) return null;
  return milestoneDateIssue(next, now);
};

export const createMilestoneSchema = z.object({
  projectCode: z.string().min(1).max(50),
  title: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
  // ISO date string ("YYYY-MM-DD") — an ESTIMATE at draft time. It cannot be
  // set in the past; the date stays optional.
  estimatedCompletionDate: z
    .string()
    .max(20)
    .optional()
    .superRefine((value, ctx) => {
      if (value === undefined) return;
      const issue = milestoneDateIssue(value);
      if (issue) ctx.addIssue({ code: "custom", message: issue });
    }),
});

// Status is intentionally the only way a milestone leaves "draft" — creation
// (createMilestoneSchema) never accepts one.
//
// A past date is NOT rejected here: an update that leaves the date alone (a
// rename, completing it) re-sends the stored date, which may already be past.
// Moving a milestone to a new past date is refused in the service, which can
// compare against the stored value.
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
