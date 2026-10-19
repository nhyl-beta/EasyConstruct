import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { requireRole } from "../../middleware/auth.js";
import {
  createBudgetAdjustmentSchema,
  updateBudgetAdjustmentSchema,
} from "../../validators/budget-adjustment-validators.js";
import * as controller from "./controller.js";

export const budgetAdjustmentsRoutes = Router();

budgetAdjustmentsRoutes.get("/", controller.getAll);
budgetAdjustmentsRoutes.get("/:id", controller.getById);

budgetAdjustmentsRoutes.post(
  "/",
  requireRole("finance-manager", "admin"),
  validate(createBudgetAdjustmentSchema),
  controller.create,
);
budgetAdjustmentsRoutes.patch(
  "/:id",
  requireRole("finance-manager", "admin"),
  validate(updateBudgetAdjustmentSchema),
  controller.update,
);
budgetAdjustmentsRoutes.delete(
  "/:id",
  requireRole("finance-manager", "admin"),
  controller.remove,
);
