import { z } from "zod";
import { PROJECT_MEMBER_ROLES } from "../db/schema/project-members.js";

export const createProjectMemberSchema = z.object({
  projectCode: z.string().min(1).max(50),
  userId: z.number().int().positive(),
  userName: z.string().min(1).max(100),
  role: z.enum(PROJECT_MEMBER_ROLES),
});
