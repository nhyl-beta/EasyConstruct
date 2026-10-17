// server/src/validators/stakeholder-validators.ts (client demo change #4)
import { z } from "zod";
import { STAKEHOLDER_ROLES, isValidEmail } from "../project-stakeholders/rules.js";

const emailField = z
  .string()
  .trim()
  .max(255)
  .refine((v) => v === "" || isValidEmail(v), "Enter a valid email address")
  .optional()
  .nullable();

export const stakeholderFields = {
  name: z.string().trim().min(2, "Enter a name").max(255),
  company: z.string().trim().max(255).optional().nullable(),
  role: z.enum(STAKEHOLDER_ROLES, { error: "Role must be Owner, Contractor or Other" }),
  email: emailField,
  phone: z.string().trim().max(50).optional().nullable(),
};

export const stakeholderInputSchema = z.object(stakeholderFields);

export const createStakeholderSchema = z.object({ projectCode: z.string().trim().min(1).max(50), ...stakeholderFields });
export const updateStakeholderSchema = z.object(stakeholderFields).partial();

export type StakeholderInput = z.infer<typeof stakeholderInputSchema>;
