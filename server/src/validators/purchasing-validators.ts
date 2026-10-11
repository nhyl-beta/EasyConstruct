import { z } from "zod";
// Bounded only; the service checks it against the managed category list.
const category = z.string().trim().min(2).max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date as YYYY-MM-DD");
const note = z.string().trim().max(2000).optional();

export const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Every line item needs a description").max(255),
  qty: z.number().positive("Quantity must be greater than zero"),
  unit: z.string().trim().min(1).max(32),
  unitCost: z.number().min(0, "Unit cost cannot be negative"),
});

export const attachmentSchema = z.object({
  url: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().default("application/octet-stream"),
  sizeBytes: z.number().int().nonnegative().default(0),
});

// The amount is never accepted from the client: it is computed from the lines.
export const createPurchaseRequestSchema = z
  .object({
    requirementId: z.number().int().positive(),
    title: z.string().trim().min(2).max(255),
    category,
    lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
    neededBy: isoDate.optional(),
    justification: z.string().trim().max(2000).optional(),
    preferredVendor: z.string().trim().max(255).optional(),
  })
  .strict();

export const updatePurchaseRequestSchema = createPurchaseRequestSchema
  .omit({ requirementId: true })
  .partial()
  .strict();

export const decisionSchema = z.object({ note }).strict();

export const createOrderSchema = z
  .object({
    purchaseRequestId: z.string().min(1),
    vendor: z.string().trim().min(1).max(255),
    etaDate: isoDate.optional(),
    lineItems: z.array(lineItemSchema).min(1).optional(),
  })
  .strict();

export const shipOrderSchema = z.object({ etaDate: isoDate.optional() }).strict();

export const deliverOrderSchema = z
  .object({ note: z.string().trim().max(2000).optional(), receiptUrl: z.string().min(1).optional() })
  .strict();

export const payOrderSchema = z
  .object({
    invoiceNumber: z.string().trim().min(1).max(128),
    invoiceAmount: z.number().positive(),
    invoiceUrl: z.string().min(1).optional(),
    varianceNote: z.string().trim().max(2000).optional(),
  })
  .strict();

export const createClaimSchema = z
  .object({
    project: z.string().trim().min(1),
    category,
    incurredOn: isoDate,
    purpose: z.string().trim().min(3).max(255),
    amount: z.number().positive(),
    attachments: z.array(attachmentSchema).min(1, "At least one receipt is required"),
  })
  .strict();

export const payClaimSchema = z.object({ paymentReference: z.string().trim().min(1).max(128) }).strict();
