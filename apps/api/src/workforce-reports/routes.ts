import { Router } from "express";
import * as controller from "./controller.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(authenticate);
router.get("/summary", controller.getSummary);
// Fix 2.6: per-person figures and pay rates, so HR (and Admin) only.
router.get("/fairness", requireRole("human-resources", "admin"), controller.getFairness);

export default router;
