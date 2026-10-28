// Mounted at /api/public/owner-approvals. No login: the single-use token in the path is the credential.
// GET only reads (mail scanners prefetch links). Only the POST decides, and it never uses the requester's session.
import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { hitLimiter } from "../../../core/auth/throttle.js";
import { AppError } from "../../../core/utils/errors.js";
import { formatSuccess } from "../../../core/utils/response.js";
import * as service from "./service.js";

const router = Router();

// Per address, per server instance (held in memory). The 256-bit token is what makes a link impossible to guess.
const hits = new Map<string, number[]>();
const limit = (max: number, windowMs: number) => (req: Request, _res: Response, next: NextFunction) => {
  if (hitLimiter(hits, req.ip ?? "unknown", Date.now(), max, windowMs)) return next();
  next(new AppError(429, "RATE_LIMITED", "Too many attempts from this address. Please wait a few minutes and try again."));
};

/** Resets the limiter state (tests). */
export const resetOwnerApprovalLimits = () => hits.clear();

const decisionSchema = z.object({ decision: z.enum(["approve", "decline"]) });

router.get("/:token", limit(60, 15 * 60_000), async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(formatSuccess(await service.getDetails(String(req.params.token)), "Approval request retrieved"));
  } catch (err) {
    next(err);
  }
});

router.post("/:token/decision", limit(20, 15 * 60_000), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Choose Approve or Decline.");
    res.set("Cache-Control", "no-store");
    res.json(formatSuccess(await service.decide(String(req.params.token), parsed.data.decision, req.ip ?? "unknown"), "Decision recorded"));
  } catch (err) {
    next(err);
  }
});

export default router;
