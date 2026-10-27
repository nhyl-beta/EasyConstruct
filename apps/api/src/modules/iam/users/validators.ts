import { z } from "zod";

// Matches the reset-password rule enforced on the client
// (apps/web/src/hooks/use-auth-controllers.ts) so a freshly created account
// can't start out weaker than one that has been through recovery.
const passwordSchema = z.string().min(10, "Password must be at least 10 characters");

export const createUserSchema = z.object({
  // employees.id (not the EMP-xxx code). Name and email are taken from this record, never typed.
  employeeId: z.number().int().positive(),
  password: passwordSchema,
  // Validated against the roles table in users/service.ts — `users.role` is a
  // plain varchar, so there is no enum to check against here.
  role: z.string().min(1).max(50),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    email: z.string().email().max(255).optional(),
    role: z.string().min(1).max(50).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const linkEmployeeSchema = z.object({
  employeeId: z.number().int().positive(),
});

export const setUserStatusSchema = z.object({
  isActive: z.boolean(),
});

// IT Designer resetting someone else's password. Same strength rule as
// creation and self-service recovery — an administratively set password must
// not be allowed to be weaker than one the person would pick themselves.
export const setUserPasswordSchema = z.object({
  password: passwordSchema,
});
