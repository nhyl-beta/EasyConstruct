// server/src/validators/document-validators.ts — NEW
import { z } from "zod";

export const createDocumentSchema = z.object({
  documentId: z.string().min(2).max(20),
  title: z.string().min(2).max(255),
  project: z.string().min(1).max(50),
  // Checked against the active rows of document_types in documents/service.ts (the list is editable by
  // Admin and IT Designer, so it cannot be a fixed enum here).
  type: z.string().trim().min(1, "Document type is required").max(50),
  version: z.string().max(10).optional(),
  size: z.string().max(20).optional(),
  fileUrl: z.string().max(500).optional(),
  uploadedBy: z.string().max(100).optional(),
  // I: optional link to the proposal/design this document concerns.
  relatedType: z.enum(["proposal", "design"]).optional(),
  relatedId: z.number().int().positive().optional(),
  // PM reports (client demo change #10).
  reportPeriod: z.enum(["daily", "weekly", "monthly"]).optional(),
  periodDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date").optional(),
});