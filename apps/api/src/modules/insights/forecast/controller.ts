// apps/api/src/forecast/controller.ts (objectives fix 3.2)
import { NextFunction, Response } from "express";
import { formatSuccess } from "../../../core/utils/response.js";
import { assertProjectVisible } from "../../projects/index.js";
import { workflowsRepo } from "../../workflow/index.js";
import { NotFoundError } from "../../../core/utils/errors.js";
import type { AuthedRequest } from "../../../core/auth/middleware.js";
import * as service from "./service.js";
import { FEATURES } from "../../../core/config/features.js";
import { parseIdParam } from "../../../core/utils/params.js";

/** GET /api/workflows/:id/impact-forecast?timeImpactDays=N, project-scoped like the workflow itself. */
export const workflowForecast = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!FEATURES.ai) throw new NotFoundError("Impact forecast is not enabled");
    const id = parseIdParam(req.params.id, "id");
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
        await service.forecastForRequest(parseIdParam(req.params.id, "id"), { id: u.id, name: u.name, role: u.role }),
        "Impact forecast",
      ),
    );
  } catch (err) {
    next(err);
  }
};
