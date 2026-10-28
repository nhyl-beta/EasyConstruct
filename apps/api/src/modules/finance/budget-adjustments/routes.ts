import { Router } from "express";
import { validate } from "../../../core/http/validate.js";
import { requireRole } from "../../../core/auth/middleware.js";
import {
  createBudgetAdjustmentSchema,
  updateBudgetAdjustmentSchema,
} from "./validators.js";
import * as controller from "./controller.js";

export const budgetAdjustmentsRoutes = Router();

budgetAdjustmentsRoutes.get("/", controller.getAll);
budgetAdjustmentsRoutes.get("/:id", controller.getById);

budgetAdjustmentsRoutes.post(
  "/",
  requireRole("finance-manager"),
  validate(createBudgetAdjustmentSchema),
  controller.create,
);
budgetAdjustmentsRoutes.patch(
  "/:id",
  requireRole("finance-manager"),
  validate(updateBudgetAdjustmentSchema),
  controller.update,
);
budgetAdjustmentsRoutes.delete(
  "/:id",
  requireRole("finance-manager"),
  controller.remove,
);
