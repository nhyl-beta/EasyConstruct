import { Router } from "express";
import { validate } from "../../../core/http/validate.js";
import { requireRole } from "../../../core/auth/middleware.js";
import { FINANCE_PROJECT_READERS } from "../shared/access.js";
import {
  createBudgetSchema,
  updateBudgetSchema,
} from "./validators.js";
import * as controller from "./controller.js";

export const budgetsRoutes = Router();

// Reads: finance readers only (finance/access.ts); a Project Manager gets their own projects' lines
// (the controller filters). Writes: finance-manager only (Admin is read-only) — finance-budget.tsx is the
// only screen that creates/edits/deletes budget lines.
budgetsRoutes.get("/", requireRole(...FINANCE_PROJECT_READERS), controller.getAll);
budgetsRoutes.get("/:id", requireRole(...FINANCE_PROJECT_READERS), controller.getById);

budgetsRoutes.post(
  "/",
  requireRole("finance-manager"),
  validate(createBudgetSchema),
  controller.create,
);
budgetsRoutes.patch(
  "/:id",
  requireRole("finance-manager"),
  validate(updateBudgetSchema),
  controller.update,
);
budgetsRoutes.delete(
  "/:id",
  requireRole("finance-manager"),
  controller.remove,
);

export default budgetsRoutes;
