import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  createPurchaseRequestSchema,
  decisionSchema,
  updatePurchaseRequestSchema,
} from "../../validators/purchasing-validators.js";
import { purchaseRequestsController as c } from "./controller.js";

// /api/finance only requires authenticate, so every route names its roles.
// Reads are further scoped in the service: the requester's own, the PM's
// projects, staffed projects for Engineer / Site Personnel (read-only), all for Finance / Admin.
export const purchaseRequestsRouter = Router();

purchaseRequestsRouter.get("/", requireRole("finance-manager", "admin", "project-manager", "engineer", "site-personnel"), c.list);
purchaseRequestsRouter.get("/:id", requireRole("finance-manager", "admin", "project-manager", "engineer", "site-personnel"), c.get);

purchaseRequestsRouter.post("/", requireRole("engineer", "project-manager", "admin"), validate(createPurchaseRequestSchema), c.create);
purchaseRequestsRouter.patch("/:id", requireRole("engineer", "project-manager", "admin"), validate(updatePurchaseRequestSchema), c.update);

purchaseRequestsRouter.post("/:id/endorse", requireRole("project-manager", "admin"), c.endorse);
// The PM rejects while it waits for them (a "reject" at the endorsement step); Finance afterwards.
purchaseRequestsRouter.post("/:id/approve", requireRole("finance-manager", "admin"), validate(decisionSchema), c.approve);
purchaseRequestsRouter.post("/:id/reject", requireRole("finance-manager", "admin", "project-manager"), validate(decisionSchema), c.reject);
purchaseRequestsRouter.post("/:id/cancel", requireRole("engineer", "project-manager", "finance-manager", "admin"), c.cancel);
