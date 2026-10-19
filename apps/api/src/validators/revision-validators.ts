import { z } from "zod";
import { REVISION_ITEM_TYPES, REVISION_STATUSES } from "../revisions/rules.js";

// A file already stored through the shared upload utility (POST /uploads or
// the direct-to-Blob route): our own storage only, never an external link.
const storedFile = z.object({
  url: z
    .string()
    .min(1)
    .max(500)
    .refine(
      (u) => u.startsWith("/uploads/") || /^https:\/\/[^/]+\.blob\.vercel-storage\.com\//.test(u),
      "The file must be uploaded through the app",
    ),
  fileName: z.string().min(1, "File name is required").max(255),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(100),
});

export const createRevisionSchema = z
  .object({
    projectCode: z.string().min(1, "Select a project").max(50),
    itemType: z.enum(REVISION_ITEM_TYPES),
    itemId: z.number().int().positive().optional(),
    newItem: z.object({ title: z.string().trim().min(2, "Give the new item a title").max(255) }).optional(),
    versionLabel: z.string().trim().max(50).optional(),
    changeSummary: z.string().trim().min(5, "Describe what changed and why (at least 5 characters)").max(2000),
    file: storedFile,
  })
  .refine((d) => (d.itemId != null) !== (d.newItem != null), {
    message: "Choose an existing item or start a new one, not both",
    path: ["itemId"],
  })
  .refine((d) => d.newItem == null || d.itemType === "plan", {
    message: "Only a plan can be started from here; designs, blueprints and documents are created on their own pages",
    path: ["newItem"],
  });

export const revisionStatusSchema = z.object({
  status: z.enum(REVISION_STATUSES),
  comment: z.string().trim().max(2000).optional(),
});
