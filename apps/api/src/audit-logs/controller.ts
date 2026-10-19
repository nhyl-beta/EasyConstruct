import { NextFunction, Request, Response } from "express";
import { MSG } from "../constants/messages.js";
import { formatSuccess } from "../utils/response.js";
import * as service from "./service.js";
import { parsePageRequest } from "../utils/pagination.js";
import { AUDIT_SORT_COLUMNS } from "./repository.js";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);
const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return typeof v === "string" && v.length > 0 && Number.isFinite(n) ? n : undefined;
};

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters = {
      entityType: str(req.query.entityType),
      entityId: str(req.query.entityId),
      projectCode: str(req.query.projectCode),
      search: str(req.query.search),
      actor: str(req.query.actor),
      actions: str(req.query.actions)?.split(",").map((a) => a.trim()).filter(Boolean).slice(0, 20),
      dateFrom: str(req.query.dateFrom),
      dateTo: str(req.query.dateTo),
    };
    // Paging is opt-in (page / limit, or the older perPage): the dashboards
    // that count across the whole trail still call without it.
    const paging = parsePageRequest(req.query, { sortable: Object.keys(AUDIT_SORT_COLUMNS) });
    if (paging.requested) {
      const { result, meta } = await service.getPage(filters, paging);
      res.json({ ...formatSuccess(result, MSG.auditLogs.retrieved), meta });
      return;
    }
    const result = await service.getAll(filters);
    res.json(formatSuccess(result, MSG.auditLogs.retrieved));
  } catch (err) { next(err); }
};

export const getFacets = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.getFacets();
    res.json(formatSuccess(data, "Activity log filters retrieved"));
  } catch (err) { next(err); }
};
export const getSecurityOverview = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.getSecurityOverview();
    res.json(formatSuccess(data, "Security overview retrieved"));
  } catch (err) {
    next(err);
  }
};
