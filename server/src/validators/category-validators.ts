import { z } from "zod";

const name = z
  .string()
  .trim()
  .min(2, "Category name must be at least 2 characters")
  .max(64, "Category name must be at most 64 characters");
const sortOrder = z.number().int().min(0).max(100_000);

export const createCategorySchema = z.object({ name, sortOrder: sortOrder.optional() }).strict();

export const updateCategorySchema = z
  .object({ name: name.optional(), sortOrder: sortOrder.optional() })
  .strict()
  .refine((v) => v.name !== undefined || v.sortOrder !== undefined, { message: "Nothing to change" });
