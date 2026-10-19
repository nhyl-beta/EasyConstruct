// apps/api/src/validators/design-revision-validator.ts
import { z } from "zod";

export const createDesignRevisionSchema = z.object({
  designId: z.number().int().positive(),
  version: z.string().min(1).max(20),
  parentVersion: z.string().max(20).optional(),
  revisionNumber: z.number().int().positive().optional(),
  reason: z.string().max(255).optional(),
  changeSummary: z.string().optional(),
  status: z.string().max(50).optional(),
  createdBy: z.string().min(2).max(100),
});
export const updateDesignRevisionSchema = createDesignRevisionSchema.partial();