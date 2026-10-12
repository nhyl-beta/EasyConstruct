import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { createClaimSchema, decisionSchema, payClaimSchema } from "../../validators/purchasing-validators.js";
import { reimbursementsController as c } from "./controller.js";

export const reimbursementsRouter = Router();

// Only Engineers and Site Personnel file and see their own claims; "mine" must come before "/:id".
const claimants = requireRole("engineer", "site-personnel");
reimbursementsRouter.get("/mine", claimants, c.mine);
// Finance / Admin see all; a PM the claims on their projects (scoped in the service).
reimbursementsRouter.get("/", requireRole("finance-manager", "admin", "project-manager"), c.list);
// The claimant, Finance / Admin and the project's PM (checked in the service).
reimbursementsRouter.get("/:id", requireRole("finance-manager", "admin", "project-manager", "engineer", "site-personnel"), c.get);

reimbursementsRouter.post("/", claimants, validate(createClaimSchema), c.create);
reimbursementsRouter.post("/:id/endorse", requireRole("project-manager", "admin"), c.endorse);
reimbursementsRouter.post("/:id/approve", requireRole("finance-manager", "admin"), validate(decisionSchema), c.approve);
// The PM rejects at the endorsement step; Finance afterwards.
reimbursementsRouter.post("/:id/reject", requireRole("finance-manager", "admin", "project-manager"), validate(decisionSchema), c.reject);
reimbursementsRouter.post("/:id/pay", requireRole("finance-manager", "admin"), validate(payClaimSchema), c.pay);
reimbursementsRouter.post("/:id/cancel", claimants, c.cancel);
