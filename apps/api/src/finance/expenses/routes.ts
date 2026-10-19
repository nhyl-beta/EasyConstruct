import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import { FINANCE_PROJECT_READERS } from "../access.js";
import { expensesController } from "./controller.js";

export const expensesRouter = Router();

expensesRouter.get("/", requireRole(...FINANCE_PROJECT_READERS), expensesController.list);
expensesRouter.post("/", requireRole("finance-manager", "admin"), expensesController.create);
expensesRouter.post("/rescore", requireRole("finance-manager", "admin"), expensesController.rescore);
expensesRouter.patch(
  "/:id/approve",
  requireRole("finance-manager", "admin"),
  expensesController.approve,
);
expensesRouter.patch(
  "/:id/reject",
  requireRole("finance-manager", "admin"),
  expensesController.reject,
);
