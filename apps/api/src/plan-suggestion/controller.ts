// apps/api/src/plan-suggestion/controller.ts (objectives fix 3.1)
import { NextFunction, Response } from "express";
import { formatSuccess } from "../core/utils/response.js";
import { logAudit } from "../core/audit/audit.js";
import { assertProjectVisible } from "../projects/service.js";
import type { AuthedRequest } from "../core/auth/middleware.js";
import * as service from "./service.js";
import { parseIdParam } from "../core/utils/params.js";

const actorOf = (req: AuthedRequest) => ({
  id: req.authUser!.id,
  name: req.authUser!.name,
  role: req.authUser!.role,
});

export const list = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const projectCode = res.locals.query.projectCode as string;
    await assertProjectVisible(req.authUser, projectCode, "plan suggestions");
    res.json(formatSuccess(await service.listForProject(projectCode), "Plan suggestions retrieved"));
  } catch (err) {
    next(err);
  }
};

// Looks the suggestion up first so the project-scope check uses its own project code.
const loadScoped = async (req: AuthedRequest) => {
  const suggestion = await service.getSuggestion(parseIdParam(req.params.id, "id"));
  await assertProjectVisible(req.authUser, suggestion.projectCode, "plan suggestions");
  return suggestion;
};

export const accept = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const suggestion = await loadScoped(req);
    const item = await service.accept(suggestion.id, parseIdParam(req.params.itemId, "itemId"), actorOf(req), {
      assignedToUserId: req.body?.assignedToUserId,
    });
    await logAudit({
      entityType: "plan-suggestion",
      entityId: String(suggestion.id),
      action: "updated",
      actor: req.authUser!.name,
      summary: `Accepted suggested ${item.kind} (${item.createdRef ?? "checklist"}) on ${suggestion.projectCode}`,
      projectCode: suggestion.projectCode,
    });
    res.json(formatSuccess(item, "Suggestion accepted"));
  } catch (err) {
    next(err);
  }
};

export const discard = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const suggestion = await loadScoped(req);
    const item = await service.discard(suggestion.id, parseIdParam(req.params.itemId, "itemId"), actorOf(req));
    res.json(formatSuccess(item, "Suggestion discarded"));
  } catch (err) {
    next(err);
  }
};

export const regenerate = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const suggestion = await loadScoped(req);
    const projectCode = await service.regenerate(suggestion.id);
    res.json(formatSuccess(await service.listForProject(projectCode), "Plan regenerated"));
  } catch (err) {
    next(err);
  }
};
