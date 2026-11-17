import { Router } from "express";
import * as controller from "./controller.js";
import { authenticate, requireRole } from "../../../core/auth/middleware.js";

const router = Router();

router.use(authenticate);
router.get("/summary", controller.getSummary);
// Fix 2.6: per-person figures and pay rates, so HR, Admin and Owner only.
router.get("/fairness", requireRole("human-resources", "admin", "owner"), controller.getFairness);

export default router;
