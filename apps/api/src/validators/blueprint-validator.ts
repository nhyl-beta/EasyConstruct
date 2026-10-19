// apps/api/src/validators/blueprint-validator.ts
import { z } from "zod";

export const createBlueprintSchema = z.object({
  drawingNumber: z.string().min(2).max(50),
  title: z.string().min(2).max(255),
  folder: z.string().min(1).max(100),
  discipline: z.string().max(50).optional(),
  scale: z.string().max(20).optional(),
  revision: z.string().max(20).optional(),
  author: z.string().min(2).max(100),
  approval: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
  fileType: z.string().max(20).optional(),
  sizeKb: z.number().int().nonnegative().optional(),
  favorite: z.boolean().optional(),
  tags: z.string().optional(),
  projectCode: z.string().max(50).nullable().optional(),
  designId: z.number().int().nullable().optional(),
});
export const updateBlueprintSchema = createBlueprintSchema.partial();

export const decideBlueprintSchema = z.object({
  approval: z.enum(["Approved", "Rejected", "Revision Required"]),
});