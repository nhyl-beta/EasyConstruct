import { Router } from "express";
import { validate } from "../../../core/http/validate.js";
import {
  createDesignSchema,
  updateDesignSchema,
} from "./validators.js";
import { decideDesignReviewSchema } from "./design-reviews/validators.js";
import * as controller from "./controller.js";
import { authenticate, requireRole } from "../../../core/auth/middleware.js";

const router = Router();

router.use(authenticate);
router.get("/", controller.getAll);
// E1: was authenticate-only — any signed-in role could create, edit or
// delete a design. Authoring belongs to Architect; admin kept as break-glass.
router.post("/", requireRole("architect", "admin"), validate(createDesignSchema), controller.create);
router.get("/:id", controller.getById);
router.patch("/:id", requireRole("architect", "admin"), validate(updateDesignSchema), controller.update);
// Consultant's "mark as reviewed" from the designs register (same roles as POST /design-reviews/:id/decide).
router.post("/:id/review", requireRole("consultant", "project-manager", "admin"), validate(decideDesignReviewSchema), controller.review);
router.delete("/:id", requireRole("architect", "admin"), controller.remove);

export default router;
