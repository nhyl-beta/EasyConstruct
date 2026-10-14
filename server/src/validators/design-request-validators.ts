// server/src/validators/design-request-validators.ts
import { z } from "zod";
import { DISCIPLINES, IMPACTS, REQUEST_KINDS, RFA_OUTCOMES } from "../design-requests/rules.js";

// A file already stored through POST /api/uploads (same rule as requirements).
export const requestFileSchema = z.object({
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

const editable = {
  sheetNumbers: z.string().max(255).optional(),
  subject: z.string().min(3, "Overview is required").max(255),
  sectionsReferenced: z.string().max(255).optional(),
  requestText: z.string().min(10, "Describe the clarification required"),
  costImpact: z.enum(IMPACTS).default("none"),
  costNote: z.string().max(255).optional(),
  timeImpact: z.enum(IMPACTS).default("none"),
  timeDays: z.number({ message: "Time impact (days) must be a number" }).int("Time impact (days) must be a whole number").min(0, "Time impact (days) cannot be negative").max(3650, "Time impact (days) can be at most 3650").optional(),
  assignedToUserId: z.number().int().positive(),
  /** Response window in days; the default is 3 for an RFI and 4 for an RFA. */
  dueDays: z.number({ message: "Response window must be a number of days" }).int("Response window must be a whole number of days").min(1, "Response window must be at least 1 day").max(60, "Response window can be at most 60 days").optional(),
  designId: z.number().int().positive().optional(),
};

export const createDesignRequestSchema = z.object({
  kind: z.enum(REQUEST_KINDS),
  projectCode: z.string().min(1).max(50),
  discipline: z.enum(DISCIPLINES),
  followUpOfId: z.number().int().positive().optional(),
  files: z.array(requestFileSchema).max(10).optional(),
  ...editable,
});

export const updateDesignRequestSchema = z
  .object({
    sheetNumbers: editable.sheetNumbers,
    subject: editable.subject.optional(),
    sectionsReferenced: editable.sectionsReferenced,
    requestText: editable.requestText.optional(),
    costImpact: z.enum(IMPACTS).optional(),
    costNote: editable.costNote,
    timeImpact: z.enum(IMPACTS).optional(),
    timeDays: editable.timeDays,
    assignedToUserId: editable.assignedToUserId.optional(),
    dueDays: editable.dueDays,
    discipline: z.enum(DISCIPLINES).optional(),
    files: z.array(requestFileSchema).max(10).optional(),
  })
  .strict();

export const sendDesignRequestSchema = z.object({ dueDays: editable.dueDays }).strict();

export const respondDesignRequestSchema = z.object({
  responseText: z.string().min(3, "A response is required"),
  outcome: z.enum(RFA_OUTCOMES).optional(),
  files: z.array(requestFileSchema).max(10).optional(),
});

export const returnedBlockSchema = z.object({
  returnedByName: z.string().min(2).max(100),
  returnedByPosition: z.string().min(2).max(100),
  returnedAt: z.string().min(8).optional(),
});

export const followUpSchema = z.object({
  requestText: z.string().min(10, "Describe what still needs clarifying"),
  files: z.array(requestFileSchema).max(10).optional(),
  dueDays: editable.dueDays,
});

// ── Transmittals ───────────────────────────────────────────────────────────

export const TRANSMITTAL_PURPOSES = [
  "for-document",
  "for-staff",
  "for-information",
  "for-comments",
  "for-recommending-approval",
  "for-other-personnel",
  "for-compliance",
  "for-review",
  "for-approval",
  "for-computation",
  "plans-drawing",
  "communication",
  "specification",
  "billing",
  "others",
] as const;

export const createTransmittalSchema = z.object({
  projectCode: z.string().min(1).max(50),
  dateIssued: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  location: z.string().max(255).optional(),
  toName: z.string().min(2).max(255),
  thruName: z.string().max(255).optional(),
  type: z.enum(["inter-office", "inter-agency"]).default("inter-office"),
  subject: z.string().min(3).max(255),
  purposes: z.array(z.enum(TRANSMITTAL_PURPOSES)).default([]),
  purposeOther: z.string().max(255).optional(),
  receivedByName: z.string().max(255).optional(),
  items: z
    .array(
      z.object({
        requestId: z.number().int().positive().optional(),
        particulars: z.string().min(1),
        remarks: z.string().max(255).optional(),
      }),
    )
    .min(1, "Add at least one item")
    .max(50),
});

export const updateTransmittalSchema = createTransmittalSchema.omit({ projectCode: true }).partial();

export const acknowledgeTransmittalSchema = z.object({
  name: z.string().min(2).max(255),
  signature: z.string().max(255).optional(),
  office: z.string().max(255).optional(),
});

export type CreateDesignRequestInput = z.infer<typeof createDesignRequestSchema>;
export type UpdateDesignRequestInput = z.infer<typeof updateDesignRequestSchema>;
export type RespondDesignRequestInput = z.infer<typeof respondDesignRequestSchema>;
export type CreateTransmittalInput = z.infer<typeof createTransmittalSchema>;
