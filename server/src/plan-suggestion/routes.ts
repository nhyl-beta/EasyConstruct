// server/src/plan-suggestion/routes.ts (objectives fix 3.1), mounted at /api/plan-suggestions
import { Router } from "express";
import { z } from "zod";
import * as controller from "./controller.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate, validateQuery } from "../middleware/validate.js";

const router = Router();
router.use(authenticate);

const listQuery = z.object({ projectCode: z.string().min(1).max(50) });
const acceptBody = z.object({ assignedToUserId: z.number().int().positive().optional() }).default({});

// Architect, Consultant and Owner can read the plan; the PM and Admin act on it.
router.get(
  "/",
  requireRole("project-manager", "admin", "architect", "consultant", "owner"),
  validateQuery(listQuery),
  controller.list,
);
const act = requireRole("project-manager", "admin");
router.post("/:id/items/:itemId/accept", act, validate(acceptBody), controller.accept);
router.post("/:id/items/:itemId/discard", act, controller.discard);
router.post("/:id/regenerate", act, controller.regenerate);

export default router;
