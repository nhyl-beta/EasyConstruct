import { Router } from "express";
import { requireRole } from "../../../core/auth/middleware.js";
import { summaryController } from "./controller.js";

import { FINANCE_COMPANY_READERS } from "../shared/access.js";

export const summaryRouter = Router();
summaryRouter.get("/", requireRole(...FINANCE_COMPANY_READERS), summaryController.get);
