import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { createIssueSchema, updateIssueStatusSchema } from "../validators/issue-validators.js";

const router = Router();

router.use(authenticate);

router.get("/", controller.getAll);
// ai-signals E5: before "/:id", or Express matches "precedents" as an id.
router.get("/precedents/:category", controller.getPrecedents);
// B2: "/:id/precedents" has a distinct shape from both routes above/below.
router.get(
  "/:id/precedents",
  requireRole("engineer", "project-manager", "admin"),
  controller.getPrecedentsForIssue,
);
router.get("/:id", controller.getById);
router.post(
  "/",
  requireRole("site-personnel", "engineer"),
  validate(createIssueSchema),
  controller.create,
);
router.patch(
  "/:id/status",
  requireRole("project-manager", "engineer"),
  validate(updateIssueStatusSchema),
  controller.updateStatus,
);

export default router;