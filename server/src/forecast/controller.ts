// server/src/forecast/controller.ts (objectives fix 3.2)
import { NextFunction, Response } from "express";
import { formatSuccess } from "../utils/response.js";
import { assertProjectVisible } from "../projects/service.js";
import * as workflowsRepo from "../workflows/repository.js";
import { NotFoundError } from "../utils/errors.js";
import type { AuthedRequest } from "../middleware/auth.js";
import * as service from "./service.js";
import { FEATURES } from "../config/features.js";

/** GET /api/workflows/:id/impact-forecast?timeImpactDays=N, project-scoped like the workflow itself. */
export const workflowForecast = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!FEATURES.ai) throw new NotFoundError("Impact forecast is not enabled");
    const id = Number(req.params.id);
    const workflow = await workflowsRepo.findWorkflowById(id);
    if (!workflow) throw new NotFoundError("Workflow", String(id));
    await assertProjectVisible(req.authUser, workflow.projectCode, "workflows");
    const days = Number(req.query.timeImpactDays);
    const timeImpactDays = Number.isFinite(days) ? Math.max(-3650, Math.min(3650, Math.round(days))) : 0;
    res.json(formatSuccess(await service.forecastForWorkflow(id, timeImpactDays), "Impact forecast"));
  } catch (err) {
    next(err);
  }
};

/** GET /api/design-requests/:id/impact-forecast */
export const requestForecast = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!FEATURES.ai) throw new NotFoundError("Impact forecast is not enabled");
    const u = req.authUser!;
    res.json(
      formatSuccess(
        await service.forecastForRequest(Number(req.params.id), { id: u.id, name: u.name, role: u.role }),
        "Impact forecast",
      ),
    );
  } catch (err) {
    next(err);
  }
};
