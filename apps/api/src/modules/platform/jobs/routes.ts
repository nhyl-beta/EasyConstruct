// apps/api/src/jobs/routes.ts (objectives fixes 2.3 and 3.5), mounted at /api/cron
//
// Scheduled jobs for a serverless host, where an in-process timer does not
// reliably tick. Vercel Cron calls these paths with GET and, when CRON_SECRET is
// set on the project, sends it as "Authorization: Bearer <CRON_SECRET>". POST is
// accepted too so an external scheduler or a person with the secret can trigger a
// run. With no CRON_SECRET configured every request is refused.
import { timingSafeEqual } from "node:crypto";
import { NextFunction, Request, Response, Router } from "express";
import { env } from "../../../core/config/env.js";
import { formatSuccess } from "../../../core/utils/response.js";
import { ForbiddenError, UnauthorizedError } from "../../../core/utils/errors.js";
import { runSignalScan } from "../../insights/index.js";
import { runAttendanceCheck } from "../../workforce/index.js";
import { runOverdueJob } from "./overdue-service.js";
import { withJobLock } from "../../../core/jobs/lock.js";

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

const attendance = job("attendance-exceptions", () => runAttendanceCheck());
router.get("/attendance-exceptions", attendance);
router.post("/attendance-exceptions", attendance);

// Client demo change #8: the RFI/RFA overdue sweep and the 48-hour workflow-stage sweep, with the emails.
// This is what runs the sweep on Vercel, where the hourly in-process timer never starts. Only one instance
// runs it at a time; a run that finds another one going reports ran: false.
const OVERDUE_LOCK = 74_2026_08;
const overdue = job("overdue", () => withJobLock(OVERDUE_LOCK, () => runOverdueJob()));
router.get("/overdue", overdue);
router.post("/overdue", overdue);

export default router;
