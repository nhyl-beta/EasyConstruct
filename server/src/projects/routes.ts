import { NextFunction, Request, Response, Router } from 'express';
import * as controller from "./controller.js";
import { validate }    from "../middleware/validate.js";
import {
  createProjectSchema,
  updateProjectSchema,
} from "../validators/project-validator.js";
import { authenticate, requireRole } from '../middleware/auth.js';
import { ValidationError } from "../utils/errors.js";
import lifecycleRoutes from "../lifecycle/routes.js";
import * as service from "./service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { parseIdParam } from "../utils/params.js";

const router = Router();

// updateProjectSchema.omit()s status/progress/statusTone, which would
// otherwise mean a client that sends them just has them silently stripped —
// not rejected. Checked here, before validate() runs, so the caller actually
// finds out those fields are lifecycle-owned instead of wondering why their
// status change didn't stick.
const rejectLifecycleFields = (req: Request, _res: Response, next: NextFunction) => {
  const body = req.body as Record<string, unknown>;
  const disallowed = ["status", "progress", "statusTone"].filter((k) => k in body);
  if (disallowed.length > 0) {
    return next(
      new ValidationError(
        `${disallowed.join(", ")} cannot be set via PATCH /projects/:id — use POST /projects/:id/lifecycle/advance (and hold/resume/cancel/archive) instead.`,
      ),
    );
  }
  next();
};

router.use(authenticate);

// IT Designer is deliberately absent from the write routes below: the Project
// section is read-only for that role (system administration, not project
// delivery). Enforced here, not just by hiding the buttons.

router.get ('/',    controller.getAll);
router.get ('/:id', controller.getById);
router.post(
  '/',
  requireRole("project-manager", "admin"),
  validate(createProjectSchema),
  controller.create,
);
// Engineer used to be on this list for progress reporting — that's now
// exclusively a lifecycle-computed value (Construction progress = completed
// tasks ÷ total tasks, see lifecycle/service.ts computeProgress), so an
// Engineer has no field left on this route to PATCH, and assertCanUpdateProject's
// engineer branch below is unreachable and removed.
router.patch(
  '/:id',
  requireRole("project-manager", "admin"),
  rejectLifecycleFields,
  validate(updateProjectSchema),
  controller.update,
);
router.delete(
  '/:id',
  requireRole("project-manager", "admin"),
  controller.remove,
);

// A Project Manager can read or act on the lifecycle of their own projects
// only — same ownership rule as the project record itself.
const pmOwnsProject = async (req: AuthedRequest, _res: Response, next: NextFunction) => {
  try {
    if (req.authUser?.role === "project-manager") {
      await service.getById(parseIdParam(req.params.id, "id"), {
        role: req.authUser.role,
        userId: req.authUser.id,
        name: req.authUser.name,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};

router.use('/:id/lifecycle', pmOwnsProject, lifecycleRoutes);

export default router;