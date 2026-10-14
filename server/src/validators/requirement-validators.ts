import { z } from "zod";
import { REQUIREMENT_CATEGORIES, REQUIREMENT_STATUSES } from "../requirements/types.js";

// A file already stored through POST /api/uploads. The URL must be one of our
// own storage locations — a blob URL or a local /uploads/ path — not an
// arbitrary external link.
const attachmentSchema = z.object({
  url: z
    .string()
    .min(1)
    .max(500)
    .refine(
      (u) => u.startsWith("/uploads/") || /^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(u),
      "Attachment must be a file uploaded through the app",
    ),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().nonnegative(),
});

export const createRequirementSchema = z.object({
  requirementId: z.string().min(2).max(20).optional(),
  title: z.string().min(4, "Title is required"),
  project: z.string().min(2, "Select a project"),
  category: z.enum(REQUIREMENT_CATEGORIES),
  description: z.string().min(10, "Description must be at least 10 characters"),
  status: z.enum(REQUIREMENT_STATUSES).optional(),
  // Required on every requirement — saving a draft and submitting both.
  attachments: z.array(attachmentSchema).min(1, "Attach at least one file").max(10),
  createdBy: z.string().min(2),
});

export const structureRequirementSchema = z.object({
  text: z.string().trim().min(10, "Describe the requirement in at least 10 characters").max(5000),
  title: z.string().max(255).optional(),
  projectType: z.string().max(100).optional(),
  category: z.string().max(50).optional(),
});

export const generateDraftSchema = z.object({
  projectCode: z.string().min(1).max(50),
  category: z.enum(["Objectives", "Materials", "Constraints", "Specifications", "Other"]),
});

export const updateRequirementSchema = createRequirementSchema.partial();

export type CreateRequirementInput = z.infer<typeof createRequirementSchema>;
export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;