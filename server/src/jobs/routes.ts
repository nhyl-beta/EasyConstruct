// server/src/jobs/routes.ts (objectives fixes 2.3 and 3.5), mounted at /api/cron
//
// Scheduled jobs for a serverless host, where an in-process timer does not
// reliably tick. Vercel Cron calls these paths with GET and, when CRON_SECRET is
// set on the project, sends it as "Authorization: Bearer <CRON_SECRET>". POST is
// accepted too so an external scheduler or a person with the secret can trigger a
// run. With no CRON_SECRET configured every request is refused.
import { timingSafeEqual } from "node:crypto";
import { NextFunction, Request, Response, Router } from "express";
import { env } from "../config/env.js";
import { formatSuccess } from "../utils/response.js";
import { ForbiddenError, UnauthorizedError } from "../utils/errors.js";
import { runSignalScan } from "../signals/scan.js";

export const secretMatches = (provided: string | undefined, expected: string | undefined): boolean => {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const requireCronSecret = (req: Request, _res: Response, next: NextFunction) => {
  if (!env.CRON_SECRET) return next(new ForbiddenError("Scheduled jobs are disabled: CRON_SECRET is not set"));
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!secretMatches(token, env.CRON_SECRET)) return next(new UnauthorizedError("Invalid cron secret"));
  next();
};

const router = Router();
router.use(requireCronSecret);

const job = (name: string, run: () => Promise<unknown>) => async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await run();
    // null means the job was skipped (switched off, or another instance is running it).
    res.json(formatSuccess({ job: name, ran: result !== null, result }, `${name} finished`));
  } catch (err) {
    next(err);
  }
};

const signals = job("signals", () => runSignalScan());
router.get("/signals", signals);
router.post("/signals", signals);

export default router;
