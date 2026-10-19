// apps/api/src/revisions/routes.ts
import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { createRevisionSchema, revisionStatusSchema } from "../validators/revision-validators.js";
import { REVISION_READ_ROLES, REVISION_WRITE_ROLES } from "./rules.js";

const router = Router();

router.use(authenticate);

const canRead = requireRole(...REVISION_READ_ROLES);

// Fixed paths first, so "summary" / "compare" / "by-item" are never read as an id.
router.get("/summary", canRead, controller.getSummary);
router.get("/compare", canRead, controller.compare);
router.get("/by-item/:itemType/:itemId", canRead, controller.getHistory);

router.get("/", canRead, controller.getAll);
router.post("/", requireRole(...REVISION_WRITE_ROLES), validate(createRevisionSchema), controller.create);
router.get("/:id", canRead, controller.getById);
router.get("/:id/download", canRead, controller.download);
// Reviewers (consultant / project-manager / admin) decide; the architect may
// only submit a draft. Which transitions are legal is enforced in rules.ts.
router.patch("/:id/status", canRead, validate(revisionStatusSchema), controller.setStatus);

export default router;
