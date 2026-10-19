import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  createOrderSchema,
  deliverOrderSchema,
  payOrderSchema,
  shipOrderSchema,
} from "../../validators/purchasing-validators.js";
import { procurementController as c } from "./controller.js";

export const procurementRouter = Router();

// Reads are scoped in the service: Finance / Admin see all, PM their projects, staff their staffed projects.
const readers = requireRole("finance-manager", "admin", "project-manager", "engineer", "site-personnel");
procurementRouter.get("/", readers, c.list);
procurementRouter.get("/:id", readers, c.get);

procurementRouter.post("/", requireRole("finance-manager", "admin"), validate(createOrderSchema), c.create);
procurementRouter.post("/:id/ship", requireRole("finance-manager", "admin"), validate(shipOrderSchema), c.ship);
// Receiving: people on the project (checked in the service), never the order creator.
procurementRouter.post("/:id/deliver", requireRole("engineer", "site-personnel", "project-manager", "admin"), validate(deliverOrderSchema), c.deliver);
procurementRouter.post("/:id/pay", requireRole("finance-manager", "admin"), validate(payOrderSchema), c.pay);
procurementRouter.post("/:id/cancel", requireRole("finance-manager", "admin"), c.cancel);
