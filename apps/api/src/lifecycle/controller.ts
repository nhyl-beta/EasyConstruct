// apps/api/src/lifecycle/controller.ts — NEW
import { NextFunction, Response } from "express";
import { formatSuccess } from "../core/utils/response.js";
import { MSG } from "../core/config/messages.js";
import type { AuthedRequest } from "../core/auth/middleware.js";
import * as projectsService from "../projects/service.js";
import * as service from "./service.js";
import type { LifecycleActor } from "./service.js";
import { parseIdParam } from "../core/utils/params.js";

// Every handler here is project-scoped by numeric :id (mounted under
// projects/routes.ts with mergeParams), same as every other
// /api/projects/:id/... route — resolved to the project's CODE once, since
// that's what the lifecycle module and every domain table key off.
const resolveProjectCode = async (req: AuthedRequest): Promise<string> => {
  const project = await projectsService.getById(
    parseIdParam(req.params.id, "id"),
    req.authUser ? { role: req.authUser.role, userId: req.authUser.id } : undefined,
  );
  return project.code;
};

const actorFrom = (req: AuthedRequest): LifecycleActor => ({
  id: req.authUser?.id ?? 0,
  name: req.authUser?.name ?? "unknown",
  role: req.authUser?.role ?? "",
});

export const getLifecycle = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const code = await resolveProjectCode(req);
    const data = await service.getLifecycleView(code);
    res.json(formatSuccess(data, MSG.lifecycle.retrieved));
  } catch (err) {
    next(err);
  }
};

export const getCloseoutSummary = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const code = await resolveProjectCode(req);
    const data = await service.getCloseoutSummary(code);
    res.json(formatSuccess(data, "Closeout summary retrieved"));
  } catch (err) {
    next(err);
  }
};

export const advance = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const code = await resolveProjectCode(req);
    const data = await service.advance(code, actorFrom(req), req.body ?? {});
    res.json(formatSuccess(data, MSG.lifecycle.advanced));
  } catch (err) {
    next(err);
  }
};

export const hold = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const code = await resolveProjectCode(req);
    const data = await service.hold(code, actorFrom(req), req.body ?? {});
    res.json(formatSuccess(data, MSG.lifecycle.held));
  } catch (err) {
    next(err);
  }
};

export const resume = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const code = await resolveProjectCode(req);
    const data = await service.resume(code, actorFrom(req));
    res.json(formatSuccess(data, MSG.lifecycle.resumed));
  } catch (err) {
    next(err);
  }
};

export const cancel = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const code = await resolveProjectCode(req);
    const data = await service.cancel(code, actorFrom(req), req.body ?? {});
    res.json(formatSuccess(data, MSG.lifecycle.cancelled));
  } catch (err) {
    next(err);
  }
};

export const archive = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const code = await resolveProjectCode(req);
    const data = await service.archive(code, actorFrom(req));
    res.json(formatSuccess(data, MSG.lifecycle.archived));
  } catch (err) {
    next(err);
  }
};
