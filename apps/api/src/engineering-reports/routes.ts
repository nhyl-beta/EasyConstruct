import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  createEngineeringReportSchema,
  updateEngineeringReportSchema,
} from "../validators/engineering-reports-validators.js";

const router = Router();

// Was mounted with no auth at all. Who may flip a report to
// Approved/Rejected/Revision Required is enforced in the service (only
// project-manager/admin — an engineer reviewing their own submission would
// be marking their own work), not here: the route-level guard only says who
// may ever call create/update, same split as projects PATCH.
router.use(authenticate);

router.get("/", controller.getAll);
router.post(
  "/",
  requireRole("engineer", "admin"),
  validate(createEngineeringReportSchema),
  controller.create,
);
router.get("/:id", controller.getById);
router.patch(
  "/:id",
  requireRole("engineer", "admin", "project-manager"),
  validate(updateEngineeringReportSchema),
  controller.update,
);
router.delete("/:id", requireRole("engineer", "admin"), controller.remove);

export default router;