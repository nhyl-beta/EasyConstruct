// apps/api/src/validators/architect-document-validator.ts
import { z } from "zod";

export const createArchitectDocumentSchema = z.object({
  designId: z.number().int().positive().optional(),
  title: z.string().min(2).max(255),
  category: z.string().min(2).max(50),
  version: z.string().max(20).optional(),
  owner: z.string().min(2).max(100),
  fileType: z.string().max(20).optional(),
  sizeKb: z.number().int().nonnegative().optional(),
  status: z.string().max(50).optional(),
});
export const updateArchitectDocumentSchema = createArchitectDocumentSchema.partial();