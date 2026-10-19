import { Router } from "express";
import { requireRole } from "../../core/auth/middleware.js";
import { projectProfitabilityController } from "./controller.js";

import { FINANCE_COMPANY_READERS } from "../access.js";

export const projectProfitabilityRouter = Router();
projectProfitabilityRouter.get("/", requireRole(...FINANCE_COMPANY_READERS), projectProfitabilityController.list);
