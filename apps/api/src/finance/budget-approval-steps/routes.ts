import { Router } from "express";
import { validate } from "../../core/http/validate.js";
import { requireRole } from "../../core/auth/middleware.js";
import { decideBudgetApprovalSchema } from "../../validators/budget-approval-validators.js";
import * as controller from "./controller.js";

export const budgetApprovalStepsRoutes = Router();

budgetApprovalStepsRoutes.get("/", controller.getAll);
budgetApprovalStepsRoutes.post(
  "/decide",
  requireRole("finance-manager", "admin"),
  validate(decideBudgetApprovalSchema),
  controller.decide,
);
