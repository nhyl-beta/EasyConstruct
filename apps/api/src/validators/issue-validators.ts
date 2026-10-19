// apps/api/src/validators/issue-validators.ts — NEW
import { z } from "zod";

export const createIssueSchema = z.object({
  issueCode: z.string().min(2).max(20),
  projectCode: z.string().min(1).max(50),
  title: z.string().min(2).max(255),
  description: z.string().min(5).max(2000),
  category: z
    .enum(["Technical", "Structural", "Material", "Schedule", "Resource", "Quality", "Safety", "Other"])
    .optional(),
  severity: z.enum(["Low", "Medium", "High", "Critical"]).optional(),
  siteContext: z.string().max(255).optional(),
  attachmentUrl: z.string().max(500).optional(),
  reportedByName: z.string().max(100).optional(),
});

export const updateIssueStatusSchema = z
  .object({
    status: z.enum(["Submitted", "Under Review", "Resolved", "Rejected"]),
    resolutionNotes: z.string().max(2000).optional(),
  })
  .refine(
    (data) => data.status !== "Resolved" || !!data.resolutionNotes?.trim(),
    { message: "Resolution notes are required to resolve an issue", path: ["resolutionNotes"] },
  );