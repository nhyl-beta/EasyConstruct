import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import { approvalsController } from "./controller.js";

export const approvalsRouter = Router();
approvalsRouter.get("/", requireRole("finance-manager", "admin"), approvalsController.list);
