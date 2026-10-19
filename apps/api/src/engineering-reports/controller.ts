import { NextFunction, Request, Response } from "express";
import { HTTP } from "../constants/http-status.js";
import { MSG } from "../constants/messages.js";
import { formatSuccess } from "../utils/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import * as service from "./service.js";
import type { EngineeringReportFilters } from "./types.js";
import { assertProjectVisible, scopeRowsToVisible, scopedProjectCodes } from "../projects/service.js";
import { parsePageRequest, sendPaged } from "../utils/pagination.js";
import { REPORT_SORT_COLUMNS } from "./repository.js";
import { parseIdParam } from "../utils/params.js";

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters: EngineeringReportFilters = {
      project: req.query.project as string,
      type: req.query.type as string,
      status: req.query.status as string,
      search: req.query.search as string,
    };
    const paging = parsePageRequest(req.query, { sortable: Object.keys(REPORT_SORT_COLUMNS) });
    if (paging.requested) {
      const codes = await scopedProjectCodes((req as AuthedRequest).authUser);
      const { items, meta } = await service.getPage({ ...filters, ...(codes ? { codes } : {}) }, paging);
      const typeStatusCounts = req.query.counts === "1" ? await service.typeStatusCounts({ ...filters, ...(codes ? { codes } : {}) }) : undefined;
      sendPaged(res, items, MSG.engineeringReports.retrieved, typeStatusCounts ? { ...meta, typeStatusCounts } : meta);
      return;
    }
    const data = await scopeRowsToVisible(
      (req as AuthedRequest).authUser,
      await service.getAll(filters),
      (r) => r.project,
    );
    res.json(formatSuccess(data, MSG.engineeringReports.retrieved));
  } catch (err) {
    next(err);
  }
};

export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getById(parseIdParam(req.params.id, "id"));
    await assertProjectVisible((req as AuthedRequest).authUser, data.project, "engineering reports");
    res.json(formatSuccess(data, MSG.engineeringReports.single));
  } catch (err) {
    next(err);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.create(req.body);
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.engineeringReports.created));
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
    );
    res.json(formatSuccess(data, MSG.engineeringReports.updated));
  } catch (err) {
    next(err);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.remove(parseIdParam(req.params.id, "id"));
    res.json(formatSuccess(data, MSG.engineeringReports.deleted));
  } catch (err) {
    next(err);
  }
};