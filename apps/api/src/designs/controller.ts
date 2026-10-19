import { NextFunction, Request, Response } from "express";
import { HTTP } from "../core/config/http-status.js";
import { MSG }  from "../core/config/messages.js";
import { formatSuccess } from "../core/utils/response.js";
import * as service from "./service.js";
import type { DesignFilters } from "./types.js";
import type { AuthedRequest } from "../core/auth/middleware.js";
import { assertAssignedToProject, assignedCodesFor, isAssignedScoped, scopeRowsToAssigned } from "../projects/scope.js";
import { parsePageRequest, sendPaged } from "../core/utils/pagination.js";
import { DESIGN_SORT_COLUMNS } from "./repository.js";
import { parseIdParam } from "../core/utils/params.js";

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  const auth = (req as AuthedRequest).authUser;
  try {
    const filters: DesignFilters = {
      status: req.query.status as string,
      discipline: req.query.discipline as string,
      projectCode: req.query.projectCode as string,
      search: req.query.search as string,
    };
    const paging = parsePageRequest(req.query, { sortable: Object.keys(DESIGN_SORT_COLUMNS) });
    if (paging.requested) {
      const codes = isAssignedScoped(auth) ? [...(await assignedCodesFor(auth))] : undefined;
      const { items, meta } = await service.getPage({ ...filters, ...(codes ? { codes } : {}) }, paging);
      const statusCounts = req.query.counts === "1" ? await service.statusCounts({ ...filters, ...(codes ? { codes } : {}) }) : undefined;
      sendPaged(res, items, MSG.designs.retrieved, statusCounts ? { ...meta, statusCounts } : meta);
      return;
    }
    const data = await scopeRowsToAssigned(auth, await service.getAll(filters), (d) => d.projectCode);
    res.json(formatSuccess(data, MSG.designs.retrieved));
  } catch (err) { next(err); }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getById(parseIdParam(req.params.id, "id"));
    await assertAssignedToProject((req as AuthedRequest).authUser, data.projectCode, "designs");
    res.json(formatSuccess(data, MSG.designs.single));
  } catch (err) { next(err); }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await assertAssignedToProject((req as AuthedRequest).authUser, req.body.projectCode, "designs");
    const data = await service.create(req.body);
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.designs.created));
  } catch (err) { next(err); }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = (req as AuthedRequest).authUser;
    const existing = await service.getById(parseIdParam(req.params.id, "id"));
    await assertAssignedToProject(auth, existing.projectCode, "designs");
    if (req.body.projectCode) await assertAssignedToProject(auth, req.body.projectCode, "designs");
    const data = await service.update(parseIdParam(req.params.id, "id"), req.body);
    res.json(formatSuccess(data, MSG.designs.updated));
  } catch (err) { next(err); }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const existing = await service.getById(parseIdParam(req.params.id, "id"));
    await assertAssignedToProject((req as AuthedRequest).authUser, existing.projectCode, "designs");
    const data = await service.remove(parseIdParam(req.params.id, "id"));
    res.json(formatSuccess(data, MSG.designs.deleted));
  } catch (err) { next(err); }
};