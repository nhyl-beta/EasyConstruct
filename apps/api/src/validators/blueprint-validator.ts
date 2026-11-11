// apps/api/src/validators/blueprint-validator.ts
import { z } from "zod";

export const createBlueprintSchema = z.object({
  drawingNumber: z.string().min(2).max(50),
  title: z.string().min(2).max(255),
  folder: z.string().min(1).max(100),
  discipline: z.string().max(50).optional(),
  scale: z.string().max(20).optional(),
  revision: z.string().max(20).optional(),
  // The server sets the author from the signed-in user, and approval only changes through POST /:id/decide.
  author: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  fileType: z.string().max(20).optional(),
  sizeKb: z.number().int().nonnegative().optional(),
  fileUrl: z.string().max(2000).nullable().optional(),
  // Only a JPEG data URL, so the value is safe to use as an <img src>. shortcut: stored in the row (about 30 KB), move to file storage if the list grows large.
  thumbnail: z.string().max(150_000).regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/).nullable().optional(),
  favorite: z.boolean().optional(),
  tags: z.string().optional(),
  projectCode: z.string().max(50).nullable().optional(),
  designId: z.number().int().nullable().optional(),
});
export const updateBlueprintSchema = createBlueprintSchema.omit({ author: true }).partial();

export const decideBlueprintSchema = z.object({
  approval: z.enum(["Approved", "Rejected", "Revision Required"]),
});