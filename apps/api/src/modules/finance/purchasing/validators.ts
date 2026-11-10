import { z } from "zod";
// Bounded only; the service checks it against the managed category list.
const category = z.string().trim().min(2).max(64);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date as YYYY-MM-DD");
const note = z.string().trim().max(2000).optional();

// "Today" in the business's own timezone (Asia/Manila), so a server running in UTC does not reject a
// date that is still today in Manila. Evaluated on every parse, not once at start-up.
export const manilaToday = (now: Date = new Date()): string =>
  now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

/** B-87: a request cannot be needed by a day that has already passed. */
export const neededByDate = isoDate.refine((d) => d >= manilaToday(), {
  message: "Needed-by date cannot be in the past",
});

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
const purchaseRequestFields = {
  requirementId: z.number().int().positive(),
  title: z.string().trim().min(2).max(255),
  category,
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
  neededBy: isoDate.optional(),
  justification: z.string().trim().max(2000).optional(),
  preferredVendor: z.string().trim().max(255).optional(),
};

// The past-date rule applies when a request is raised. An edit that leaves an already-saved date
// alone must not start failing just because that date has since gone by.
export const createPurchaseRequestSchema = z
  .object({ ...purchaseRequestFields, neededBy: neededByDate.optional() })
  .strict();

export const updatePurchaseRequestSchema = z
  .object(purchaseRequestFields)
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
