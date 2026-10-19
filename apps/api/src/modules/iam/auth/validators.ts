import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

// The 10-character minimum mirrors the rule the reset form already enforces
// client-side (apps/web/src/hooks/use-auth-controllers.ts).
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .regex(/[A-Z]/, "Password needs an uppercase letter")
    .regex(/\d/,"Password needs a number"),
});

export const ownerRecoveryInitiateSchema = z.object({
  targetUserId: z.coerce.number().int().positive(),
});
