// controller.ts
import { NextFunction, Request, Response } from "express";
import { HTTP } from "../../../../core/config/http-status.js";
import { MSG } from "../../../../core/config/messages.js";
import { formatSuccess } from "../../../../core/utils/response.js";
import * as service from "./service.js";
import { byDate, byString, respondList } from "../../../../core/utils/pagination.js";
import { ensureProjectRevisionDemo } from "./demo.js";
import { env } from "../../../../core/config/env.js";
import { ForbiddenError, ValidationError } from "../../../../core/utils/errors.js";
import type { AuthedRequest } from "../../../../core/auth/middleware.js";
import { parseIdParam } from "../../../../core/utils/params.js";

const scopeOf = (req: Request) => {
  const u = (req as AuthedRequest).authUser;
  return u ? { role: u.role, userId: u.id, name: u.name } : undefined;
};
const actorOf = (req: Request) => {
  const u = (req as AuthedRequest).authUser;
  return u ? { id: u.id, name: u.name, role: u.role } : undefined;
};

/** Demo generation is an explicit admin action and is off in production unless ALLOW_DEMO_SEED=true. */
export const isDemoAllowed = (nodeEnv: string, allowFlag: string | undefined) => nodeEnv !== "production" || allowFlag === "true";
export const demoAllowed = () => isDemoAllowed(env.NODE_ENV, process.env.ALLOW_DEMO_SEED);

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      designId: req.query.designId ? Number(req.query.designId) : undefined,
      status: req.query.status as string | undefined,
    };
    const projectCode = typeof req.query.projectCode === "string" && req.query.projectCode ? req.query.projectCode : undefined;
    if (projectCode) {
      const { items, summary } = await service.getByProject(projectCode, scopeOf(req), filters);
      res.json({ ...formatSuccess(items, MSG.designRevisions.retrieved), meta: { ...summary, demoAllowed: demoAllowed() } });
      return;
    }
    respondList(res, req.query, await service.getAll(filters, scopeOf(req)), MSG.designRevisions.retrieved, {
      version: byString((r) => String(r.version)),
      status: byString((r) => r.status),
      createdAt: byDate((r) => r.createdAt),
    });
  } catch (err) { next(err); }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getById(parseIdParam(req.params.id, "id"));
    await service.assertCanSeeDesign(data.designId, scopeOf(req));
    res.json(formatSuccess(data, MSG.designRevisions.single));
  } catch (err) { next(err); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await service.assertCanSeeDesign(req.body.designId, scopeOf(req));
    const data = await service.create(req.body, actorOf(req));
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.designRevisions.created));
  } catch (err) { next(err); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await service.getById(parseIdParam(req.params.id, "id"));
    await service.assertCanSeeDesign(existing.designId, scopeOf(req));
    const data = await service.update(parseIdParam(req.params.id, "id"), req.body, actorOf(req));
    res.json(formatSuccess(data, MSG.designRevisions.updated));
  } catch (err) { next(err); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await service.getById(parseIdParam(req.params.id, "id"));
    await service.assertCanSeeDesign(existing.designId, scopeOf(req));
    const data = await service.remove(parseIdParam(req.params.id, "id"), actorOf(req));
    res.json(formatSuccess(data, MSG.designRevisions.deleted));
  } catch (err) { next(err); }
};

export const generateDemo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!demoAllowed()) {
      throw new ForbiddenError("Demo data generation is disabled in production (set ALLOW_DEMO_SEED=true to allow it)");
    }
    const projectCode = typeof req.query.projectCode === "string" ? req.query.projectCode : "";
    if (!projectCode) throw new ValidationError("projectCode is required");
    const result = await ensureProjectRevisionDemo(projectCode, { includeProposal: req.query.includeProposal === "true" });
    res.json(formatSuccess(result, result.skipped ? `Nothing generated: ${result.skipped}` : `Generated ${result.created} demo revision(s)`));
  } catch (err) { next(err); }
};
