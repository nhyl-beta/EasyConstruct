import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../../../core/http/validate.js";
import { authenticate, requireRole } from "../../../core/auth/middleware.js";
import {
  createEngineeringReportSchema,
  updateEngineeringReportSchema,
} from "./validators.js";

const router = Router();

// Was mounted with no auth at all. Who may flip a report to
// Approved/Rejected/Revision Required is enforced in the service (only
// project-manager/admin — an engineer reviewing their own submission would
// be marking their own work), not here: the route-level guard only says who
// may ever call create/update, same split as projects PATCH.
router.use(authenticate);

// Site reports are for the people who run or review the site, not HR, Finance or Site Personnel (B-128).
const readers = requireRole("engineer", "project-manager", "owner", "consultant", "admin");
router.get("/", readers, controller.getAll);
router.post(
  "/",
  requireRole("engineer", "admin"),
  validate(createEngineeringReportSchema),
  controller.create,
);
router.get("/:id", readers, controller.getById);
router.patch(
  "/:id",
  requireRole("engineer", "admin", "project-manager"),
  validate(updateEngineeringReportSchema),
  controller.update,
);
router.delete("/:id", requireRole("engineer", "admin"), controller.remove);

export default router;