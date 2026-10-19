import { Router } from "express";
import { requireRole } from "../../../core/auth/middleware.js";
import { approvalsController } from "./controller.js";

export const approvalsRouter = Router();
approvalsRouter.get("/", requireRole("finance-manager", "admin"), approvalsController.list);
