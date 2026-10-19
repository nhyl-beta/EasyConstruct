import { z } from "zod";

export const uploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  dataUrl: z.string().min(1), // validated/size-checked in service.ts (needs the decoded buffer)
});