// apps/api/src/calendar/routes.ts — NEW (A2)
import { Router } from "express";
import { authenticate } from "../core/auth/middleware.js";
import type { AuthedRequest } from "../core/auth/middleware.js";
import { formatSuccess } from "../core/utils/response.js";
import { UnauthorizedError, ValidationError } from "../core/utils/errors.js";
import { getCalendarEvents } from "./service.js";
import { parseRange } from "./events.js";
import { ALL_DOMAIN, cached } from "../core/cache/index.js";
import { userScope } from "../core/cache/scope.js";

const router = Router();
router.use(authenticate);

router.get("/events", async (req: AuthedRequest, res, next) => {
  try {
    if (!req.authUser) throw new UnauthorizedError();
    // What a user sees depends on their role and assignments, so the entry is
    // per user; any write anywhere invalidates it. 60 s.
    // ?from=&to= (YYYY-MM-DD) narrows the window; it never widens what the user may see.
    let range;
    try {
      range = parseRange(req.query.from, req.query.to);
    } catch (e) {
      throw new ValidationError((e as Error).message);
    }
    const actor = { id: req.authUser.id, role: req.authUser.role, name: req.authUser.name };
    const events = await cached("calendar", userScope(req.authUser)!, 60, () => getCalendarEvents(actor, range), {
      deps: [ALL_DOMAIN],
      query: range,
    });
    res.json(formatSuccess(events, "Calendar events retrieved"));
  } catch (err) {
    next(err);
  }
});

export default router;
