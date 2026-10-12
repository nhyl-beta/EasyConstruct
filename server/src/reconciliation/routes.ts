// server/src/reconciliation/routes.ts (objectives fix 1.3), mounted at /api/admin/reconciliation. Read-only.
import { NextFunction, Request, Response, Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import { formatSuccess } from "../utils/response.js";
import { runReconciliation } from "./service.js";

const router = Router();
router.use(authenticate);

router.get("/", requireRole("admin", "it-designer", "owner"), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(formatSuccess(await runReconciliation(), "Reconciliation complete"));
  } catch (err) {
    next(err);
  }
});

export default router;
