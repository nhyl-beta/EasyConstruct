import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { createProjectMemberSchema } from "../validators/project-member-validators.js";

const router = Router();

router.use(authenticate);

router.get("/", controller.getAll);
router.post(
  "/",
  requireRole("project-manager", "admin"),
  validate(createProjectMemberSchema),
  controller.create,
);
router.delete(
  "/:id",
  requireRole("project-manager", "admin"),
  controller.remove,
);

export default router;
