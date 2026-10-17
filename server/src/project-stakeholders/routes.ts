// server/src/project-stakeholders/routes.ts, mounted at /api/stakeholders (client demo change #4)
import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createStakeholderSchema, updateStakeholderSchema } from "../validators/stakeholder-validators.js";
import * as controller from "./controller.js";

const router = Router();
router.use(authenticate);

// Reads: anyone who can see the project (project-scoped in the service). Emails and phones are only
// returned to the PM and Admin. Writes: the project's PM (own projects only) and Admin.
router.get("/", controller.list);
router.post("/", requireRole("project-manager", "admin"), validate(createStakeholderSchema), controller.create);
router.patch("/:id", requireRole("project-manager", "admin"), validate(updateStakeholderSchema), controller.update);
router.delete("/:id", requireRole("project-manager", "admin"), controller.remove);

export default router;
