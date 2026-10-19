import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../core/http/validate.js";
import { authenticate, requireRole } from "../core/auth/middleware.js";
import {
  createRequirementSchema,
  generateDraftSchema,
  structureRequirementSchema,
  updateRequirementSchema,
} from "../validators/requirement-validators.js";

const router = Router();

// Every other module mounts authenticate at the router level; requirements
// was the one that didn't, leaving create/update/delete open to unauthenticated
// callers.
router.use(authenticate);

router.get("/", controller.getAll);
// A: rule-based structuring. Before "/:id" so "structure" isn't read as an id.
router.post(
  "/structure",
  requireRole("engineer", "admin"),
  validate(structureRequirementSchema),
  controller.structure,
);
// Fix 3.4: draft from the template packs. Before "/:id" for the same reason.
router.post(
  "/generate-draft",
  requireRole("engineer", "admin"),
  validate(generateDraftSchema),
  controller.generateDraft,
);
// G: site-personnel may draft requirements on projects they are staffed on
// (enforced in service.ts); the PM still decides on the Approvals page.
router.post(
  "/",
  requireRole("engineer", "admin", "site-personnel"),
  validate(createRequirementSchema),
  controller.create,
);
router.get("/:id", controller.getById);
// project-manager is here to decide (Approved/Rejected) — the route only
// says who may ever PATCH; which status values they may set is enforced in
// requirements/service.ts assertCanSetStatus.
router.patch(
  "/:id",
  requireRole("engineer", "admin", "project-manager", "site-personnel"),
  validate(updateRequirementSchema),
  controller.update,
);
router.delete("/:id", requireRole("engineer", "admin"), controller.remove);

export default router;