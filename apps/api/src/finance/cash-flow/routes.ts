import { Router } from "express";
import { requireRole } from "../../core/auth/middleware.js";
import { cashFlowController } from "./controller.js";

import { FINANCE_COMPANY_READERS } from "../access.js";

export const cashFlowRouter = Router();
cashFlowRouter.get("/", requireRole(...FINANCE_COMPANY_READERS), cashFlowController.list);
