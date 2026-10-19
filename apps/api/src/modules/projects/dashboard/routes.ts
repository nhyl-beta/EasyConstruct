// apps/api/src/dashboard/routes.ts — mounted at /api/dashboard
import { NextFunction, Response, Router } from "express";
import { authenticate, requireRole, type AuthedRequest } from "../../../core/auth/middleware.js";
import { loadCycleSamples } from "./cycle-times.repository.js";
import { summarizeCycles } from "./cycle-times.js";
import { UnauthorizedError } from "../../../core/utils/errors.js";
import { formatSuccess } from "../../../core/utils/response.js";
import * as service from "./service.js";
import { workforceBoard } from "../../workforce/index.js";
import { ALL_DOMAIN, cached } from "../../../core/cache/index.js";
import { visibilityScope } from "../../../core/cache/scope.js";

const router = Router();
router.use(authenticate);

// Role-aware: the caller's own role (from the token) decides which dashboard
// summary is built, and every figure is scoped to what that role may see.
router.get("/summary", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.authUser) throw new UnauthorizedError("Not signed in");
    // 45 s, keyed by who may share the result (see cache/scope.ts) and
    // invalidated by any write anywhere (the `all` domain).
    const scope = visibilityScope(req.authUser);
    const load = () => service.getSummary(req.authUser!);
    const data = scope ? await cached("dashboard", scope, 45, load, { deps: [ALL_DOMAIN] }) : await load();
    res.json(formatSuccess(data, "Dashboard summary retrieved"));
  } catch (err) {
    next(err);
  }
});

// Fix 1.4: how long approvals, request responses, payroll sign-off and issue
// resolution take, from timestamps already stored. Same for every caller. 5 minutes.
router.get("/cycle-times", requireRole("owner", "admin", "it-designer"), async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await cached("dashboard", "all", 300, async () => ({
      months: 12,
      series: summarizeCycles(await loadCycleSamples(12)),
      note: "Worked out from existing start and end timestamps over the last 12 months. Issue time to resolve uses the last update of a resolved issue.",
    }), { deps: [ALL_DOMAIN] });
    res.json(formatSuccess(data, "Cycle times retrieved"));
  } catch (err) {
    next(err);
  }
});

// HR "Workforce reporting" board for an optional date range: counts by status,
// department, site and day, in SQL. Same for every caller. 30 s.
router.get("/workforce/board", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
    const from = date(req.query.from);
    const to = date(req.query.to);
    const data = await cached("attendance", "all", 30, () => workforceBoard(from, to), {
      query: { from, to },
      deps: ["employees"],
    });
    res.json(formatSuccess(data, "Workforce board retrieved"));
  } catch (err) {
    next(err);
  }
});

// The workforce figures on their own (the HR dashboard, the admin "Workforce
// snapshot" card): same for every caller, so one shared entry. 30 s.
router.get("/workforce", async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await cached("attendance", "all", 30, () => service.getWorkforce(), { deps: ["employees"] });
    res.json(formatSuccess(data, "Workforce summary retrieved"));
  } catch (err) {
    next(err);
  }
});

export default router;
