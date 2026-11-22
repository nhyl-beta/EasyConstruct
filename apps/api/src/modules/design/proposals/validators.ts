import { z } from "zod";

export const createProposalSchema = z.object({
  proposalId: z.string().min(2).max(20),

  title: z.string().min(2).max(255),

  projectCode: z.string().min(1).max(50),

  submittedBy: z.string().min(2).max(100),

  assignedReviewer: z
    .string()
    .max(100)
    .optional(),

  status: z
    .string()
    .max(50)
    .optional(),

  amount: z
    .string()
    .max(50)
    .optional(),

  content: z
    .string()
    .optional(),

  aiValidation: z
    .string()
    .optional(),

  // The cost breakdown behind `amount` — compared server-side against EstimationPro.ai
  // reference pricing when a catalog is available (validation.ts check 5). Sent as a
  // JSON-encoded string because /submit is a multipart request (it also carries the
  // required Bill of Materials file); the controller parses it before use. Not a stored
  // column: used only while computing aiValidation, then dropped.
  breakdown: z
    .string()
    .optional(),
});

export const updateProposalSchema =
  createProposalSchema.partial();

export const reviewProposalSchema = z.object({
  status: z.enum([
    "Approved",
    "Revision Requested",
    "Rejected",
  ]),

  reviewerName: z
    .string()
    .min(2)
    .max(100),

  reviewComment: z
    .string()
    .min(1),
});

export type CreateProposalInput =
  z.infer<typeof createProposalSchema>;

export type UpdateProposalInput =
  z.infer<typeof updateProposalSchema>;

export type ReviewProposalInput =
  z.infer<typeof reviewProposalSchema>;