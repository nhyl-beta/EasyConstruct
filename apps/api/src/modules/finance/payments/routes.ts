import { Router } from "express";
import { requireRole } from "../../../core/auth/middleware.js";
import { FINANCE_PROJECT_READERS } from "../shared/access.js";
import { clientPaymentsController } from "./controller.js";

export const paymentsRouter = Router();

paymentsRouter.get("/", requireRole(...FINANCE_PROJECT_READERS), clientPaymentsController.list);
paymentsRouter.post("/", requireRole("finance-manager"), clientPaymentsController.create);
