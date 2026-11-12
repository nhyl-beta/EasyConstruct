import { Router } from "express";
import { validate } from "../../../core/http/validate.js";
import { authenticate, requireRole } from "../../../core/auth/middleware.js";
import {
  forgotPasswordSchema,
  loginSchema,
  ownerRecoveryInitiateSchema,
  resetPasswordSchema,
} from "./validators.js";
import * as controller from "./controller.js";
import { hitLimiter } from "../../../core/auth/throttle.js";
import { AppError } from "../../../core/utils/errors.js";
import type { NextFunction, Request, Response } from "express";

// Coarse per-address limit on sign-in attempts (fix 1.5). Held in memory, so on
// a serverless host it applies per instance and only slows bulk guessing from
// one address; the per-account limit in auth/service.ts is the one that holds
// everywhere. req.ip follows TRUST_PROXY (app.ts), so a client-sent X-Forwarded-For cannot pick its own bucket.
const LOGIN_HITS = new Map<string, number[]>();
const LOGIN_PER_ADDRESS = 40;
const LOGIN_WINDOW_MS = 15 * 60_000;
const loginAddressLimit = (req: Request, _res: Response, next: NextFunction) => {
  const address = req.ip ?? "unknown";
  if (!hitLimiter(LOGIN_HITS, address, Date.now(), LOGIN_PER_ADDRESS, LOGIN_WINDOW_MS)) {
    return next(new AppError(429, "TOO_MANY_ATTEMPTS", "Too many sign-in attempts from this address. Try again in a few minutes."));
  }
  next();
};

const router = Router();
router.post("/login", loginAddressLimit, validate(loginSchema), controller.login);

// Server-side sign-out: every token issued to the caller before now stops working.
router.post("/logout", authenticate, controller.logout);

// Account recovery. Both stay unauthenticated by definition — the caller is
// someone who cannot sign in.
router.post(
  "/forgot-password",
  loginAddressLimit,
  validate(forgotPasswordSchema),
  controller.forgotPassword,
);
router.post(
  "/reset-password",
  loginAddressLimit,
  validate(resetPasswordSchema),
  controller.resetPassword,
);

// Owner's fail-safe recovery of the IT Designer account — see the note atop
// auth/service.ts's initiateOwnerRecovery. Unlike the two routes above, this
// caller IS signed in (as Owner); it is a different account being recovered.
router.post(
  "/owner-recovery/initiate",
  authenticate,
  requireRole("owner"),
  validate(ownerRecoveryInitiateSchema),
  controller.initiateOwnerRecovery,
);

export const authRoutes = router;
