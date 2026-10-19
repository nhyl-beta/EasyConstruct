// apps/api/src/milestones/routes.ts — NEW
import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  createMilestoneLinkSchema,
  createMilestoneSchema,
  updateMilestoneSchema,
} from "../validators/milestone-validators.js";

const router = Router();

router.use(authenticate);

// Read is open to every authenticated role, same as projects/workflows —
// a milestone is part of "the details of a project", which every role that
// can see the project at all should be able to see.
router.get("/", controller.getAll);
router.get("/:id", controller.getById);

// Writes are the Project Manager's, mirroring projects/routes.ts exactly
// (project-manager, admin, it-designer) — a milestone belongs to the same
// record a PM already owns and edits.
const canManageMilestones = requireRole("project-manager", "admin");

router.post("/", canManageMilestones, validate(createMilestoneSchema), controller.create);
// C: engineer is let through the route only to mark a milestone completed;
// which fields/statuses/projects is enforced in milestones/service.ts.
router.patch(
  "/:id",
  requireRole("project-manager", "admin", "engineer"),
  validate(updateMilestoneSchema),
  controller.update,
);
router.delete("/:id", canManageMilestones, controller.remove);

// F4: same guard as milestone writes, plus engineer for linkType='task' —
// the engineer half depends on the request body, not just the role, so it's
// enforced in milestones/service.ts assertCanLink rather than here.
router.post(
  "/:id/links",
  requireRole("project-manager", "admin", "engineer"),
  validate(createMilestoneLinkSchema),
  controller.createLink,
);
router.delete(
  "/:id/links/:linkId",
  requireRole("project-manager", "admin", "engineer"),
  controller.removeLink,
);

export default router;
