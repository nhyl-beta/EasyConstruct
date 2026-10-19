// apps/api/src/decision-support/routes.ts (objectives fix 3.7), mounted at /api/decision-support
import { NextFunction, Response, Router } from "express";
import { z } from "zod";
import { authenticate, requireRole, type AuthedRequest } from "../../../core/auth/middleware.js";
import { validate } from "../../../core/http/validate.js";
import { formatSuccess } from "../../../core/utils/response.js";
import { EVENT_ACTIONS, EVENT_KINDS } from "./summary.js";
import * as service from "./service.js";

const router = Router();
router.use(authenticate);

const eventsSchema = z.object({
  events: z
    .array(
      z.object({
        kind: z.enum(EVENT_KINDS),
        itemKey: z.string().min(1).max(200),
        projectCode: z.string().max(50).optional().nullable(),
        action: z.enum(EVENT_ACTIONS),
      }),
    )
    .min(1)
    .max(50),
});

// Anyone shown advice can say what they did with it. Idempotent per person, item and action.
router.post("/events", validate(eventsSchema), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await service.record(req.authUser!.id, req.body.events);
    res.json(formatSuccess({ recorded: req.body.events.length }, "Recorded"));
  } catch (err) {
    next(err);
  }
});

// Acceptance rate by kind, for the people who judge whether the advice earns its place.
router.get("/summary", requireRole("admin", "owner", "it-designer"), async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(formatSuccess(await service.getSummary(), "Decision support usefulness"));
  } catch (err) {
    next(err);
  }
});

export default router;
