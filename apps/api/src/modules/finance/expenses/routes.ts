import { Router } from "express";
import { requireRole } from "../../../core/auth/middleware.js";
import { FINANCE_PROJECT_READERS } from "../shared/access.js";
import { expensesController } from "./controller.js";

export const expensesRouter = Router();

expensesRouter.get("/", requireRole(...FINANCE_PROJECT_READERS), expensesController.list);
expensesRouter.post("/", requireRole("finance-manager"), expensesController.create);
expensesRouter.post("/rescore", requireRole("finance-manager"), expensesController.rescore);
expensesRouter.patch(
  "/:id/approve",
  requireRole("finance-manager"),
  expensesController.approve,
);
expensesRouter.patch(
  "/:id/reject",
  requireRole("finance-manager"),
  expensesController.reject,
);
