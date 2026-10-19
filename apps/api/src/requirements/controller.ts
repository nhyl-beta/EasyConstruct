import { NextFunction, Request, Response } from "express";
import { HTTP } from "../core/config/http-status.js";
import { MSG } from "../core/config/messages.js";
import { formatSuccess } from "../core/utils/response.js";
import type { AuthedRequest } from "../core/auth/middleware.js";
import * as service from "./service.js";
import type { RequirementFilters } from "./types.js";
import { assertProjectVisible, scopeRowsToVisible, scopedProjectCodes } from "../projects/service.js";
import { parsePageRequest, sendPaged } from "../core/utils/pagination.js";
import { REQUIREMENT_SORT_COLUMNS } from "./repository.js";
import { FEATURES } from "../core/config/features.js";
import { NotFoundError } from "../core/utils/errors.js";
import { structureRequirement } from "./structuring.js";
import { parseIdParam } from "../core/utils/params.js";

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters: RequirementFilters = {
      project: req.query.project as string,
      category: req.query.category as string,
      status: req.query.status as string,
      search: req.query.search as string,
    };
    const paging = parsePageRequest(req.query, { sortable: Object.keys(REQUIREMENT_SORT_COLUMNS) });
    if (paging.requested) {
      const codes = await scopedProjectCodes((req as AuthedRequest).authUser);
      const { items, meta } = await service.getPage({ ...filters, ...(codes ? { codes } : {}) }, paging);
      const statusCounts = req.query.counts === "1" ? await service.statusCounts({ ...filters, ...(codes ? { codes } : {}) }) : undefined;
      sendPaged(res, items, MSG.requirements.retrieved, statusCounts ? { ...meta, statusCounts } : meta);
      return;
    }
    const data = await scopeRowsToVisible(
      (req as AuthedRequest).authUser,
      await service.findAll(filters),
      (r) => r.project,
    );
    res.json(formatSuccess(data, MSG.requirements.retrieved));
  } catch (err) {
    next(err);
  }
};

// A: pure rule-based structuring; 404 when the AI feature flag is off.
export const structure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!FEATURES.ai) throw new NotFoundError("Requirement structuring");
    res.json(formatSuccess(structureRequirement(req.body), "Requirement structured"));
  } catch (err) {
    next(err);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.findById(parseIdParam(req.params.id, "id"));
    if (data) await assertProjectVisible((req as AuthedRequest).authUser, data.project, "requirements");
    res.json(formatSuccess(data, MSG.requirements.single));
  } catch (err) {
    next(err);
  }
};

export const create = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.create(req.body, req.authUser);
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.requirements.created));
  } catch (err) {
    next(err);
  }
};

export const update = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.update(
      parseIdParam(req.params.id, "id"),
      req.body,
      req.authUser?.role ?? "",
      req.authUser,
    );
    res.json(formatSuccess(data, MSG.requirements.updated));
  } catch (err) {
    next(err);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.remove(parseIdParam(req.params.id, "id"));
    res.json(formatSuccess(data, MSG.requirements.deleted));
  } catch (err) {
    next(err);
  }
};

// Fix 3.4: a rule-based draft from the template packs. Read-only, project-scoped, 404 when decision support is off.
export const generateDraft = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!FEATURES.ai) throw new NotFoundError("Requirement drafting");
    const { projectCode, category } = req.body as { projectCode: string; category: string };
    await assertProjectVisible((req as AuthedRequest).authUser, projectCode, "requirements");
    res.json(formatSuccess(await service.generateDraftFor(projectCode, category), "Requirement draft generated"));
  } catch (err) {
    next(err);
  }
};
