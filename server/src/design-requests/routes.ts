// server/src/design-requests/routes.ts — mounted at /api/design-requests
import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createDesignRequestSchema,
  followUpSchema,
  respondDesignRequestSchema,
  returnedBlockSchema,
  sendDesignRequestSchema,
  updateDesignRequestSchema,
} from "../validators/design-request-validators.js";
import * as controller from "./controller.js";
import * as forecastController from "../forecast/controller.js";

const router = Router();
router.use(authenticate);

// Reads are open to every signed-in role but project-scoped in the service.
router.get("/", controller.list);
// Admin / Owner oversight: overdue requests, drafts never sent, stalled workflow stages.
router.get("/attention", requireRole("admin", "owner", "it-designer"), controller.attention);
router.post("/sweep", requireRole("admin"), controller.sweep);
router.get("/assignees", controller.assignees);
router.get("/:id", controller.getById);
// Fix 3.2: what approving this request would do to cost and schedule (read-only).
router.get("/:id/impact-forecast", forecastController.requestForecast);

// Raising: PM and Engineer (Admin as break-glass). An Engineer's request is a draft until the PM sends it.
const raisers = requireRole("project-manager", "engineer", "admin");
router.post("/", raisers, validate(createDesignRequestSchema), controller.create);
router.patch("/:id", raisers, validate(updateDesignRequestSchema), controller.update);
router.post("/:id/send", requireRole("project-manager", "admin"), validate(sendDesignRequestSchema), controller.send);
router.post("/:id/follow-up", raisers, validate(followUpSchema), controller.followUp);
router.post("/:id/returned", raisers, validate(returnedBlockSchema), controller.returned);
router.post("/:id/close", raisers, controller.close);

// Answering: the assigned Architect or Consultant (Admin as break-glass) — enforced again in the service.
const responders = requireRole("architect", "consultant", "admin");
router.post("/:id/acknowledge", responders, controller.acknowledge);
router.post("/:id/respond", responders, validate(respondDesignRequestSchema), controller.respond);

export default router;
