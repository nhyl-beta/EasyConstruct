import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import { summaryController } from "./controller.js";

import { FINANCE_COMPANY_READERS } from "../access.js";

export const summaryRouter = Router();
summaryRouter.get("/", requireRole(...FINANCE_COMPANY_READERS), summaryController.get);
