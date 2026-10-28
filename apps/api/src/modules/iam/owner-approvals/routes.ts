// Mounted at /api/owner-approvals. Signed-in callers only. The Owner sees every request; IT Designer (and Admin)
// see their own. No response from this router ever contains a token, a token hash or a payload.
import { NextFunction, Response, Router } from "express";
import { authenticate, requireRole, type AuthedRequest } from "../../../core/auth/middleware.js";
import { formatSuccess } from "../../../core/utils/response.js";
import { parseIdParam } from "../../../core/utils/params.js";
import * as service from "./service.js";

const router = Router();
router.use(authenticate);

router.get("/", requireRole("owner", "it-designer", "admin"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(formatSuccess(await service.listFor(req.authUser!), "Owner approval requests retrieved"));
  } catch (err) {
    next(err);
  }
});

// A requester withdraws their own pending request.
router.post("/:id/cancel", requireRole("it-designer", "admin"), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { id, name, role } = req.authUser!;
    res.json(formatSuccess(await service.cancel(parseIdParam(req.params.id, "id"), { id, name, role }), "Request cancelled"));
  } catch (err) {
    next(err);
  }
});

export default router;
