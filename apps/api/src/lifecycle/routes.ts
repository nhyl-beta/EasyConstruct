// apps/api/src/lifecycle/routes.ts — NEW
//
// Mounted with { mergeParams: true } under projects/routes.ts at
// "/:id/lifecycle", so :id here is the SAME numeric project id every other
// /api/projects/:id/... route uses. Route-level guard is just `authenticate`
// — who may actually advance/hold/resume/cancel/archive is enforced in
// lifecycle/service.ts (assertCanAdvance etc.), which is where the "is this
// PM the project's own PM" check has to live anyway, so a role-only route
// guard here would just be a second, looser copy of the same rule.
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import * as controller from "./controller.js";

const router = Router({ mergeParams: true });

router.use(authenticate);

router.get("/", controller.getLifecycle);
router.get("/closeout-summary", controller.getCloseoutSummary);
router.post("/advance", controller.advance);
router.post("/hold", controller.hold);
router.post("/resume", controller.resume);
router.post("/cancel", controller.cancel);
router.post("/archive", controller.archive);

export default router;
