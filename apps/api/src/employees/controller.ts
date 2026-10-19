import { NextFunction, Request, Response } from "express";
import { HTTP } from "../core/config/http-status.js";
import { MSG } from "../core/config/messages.js";
import { formatSuccess } from "../core/utils/response.js";
import { logAudit } from "../core/audit/audit.js";
import * as service from "./service.js";
import type { EmployeeFilters } from "./types.js";
import { AuthedRequest } from "../core/auth/middleware.js";
import { parsePageRequest, sendPaged } from "../core/utils/pagination.js";
import { cached } from "../core/cache/index.js";
import { EMPLOYEE_SORT_COLUMNS } from "./repository.js";
import { parseIdParam } from "../core/utils/params.js";

export const getAll = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters: EmployeeFilters = {
      search: req.query.search as string,
      employeeId: typeof req.query.employeeId === "string" && req.query.employeeId ? req.query.employeeId : undefined,
      department: req.query.department as string,
      status: req.query.status as string,
    };
    const paging = parsePageRequest(req.query, { sortable: Object.keys(EMPLOYEE_SORT_COLUMNS), defaultOrder: "asc" });
    // The employee list is the same for every caller who can reach this route
    // (no per-user scoping), so `all` is a safe scope. 60 s.
    const result = await cached(
      "employees",
      "all",
      60,
      async () =>
        paging.requested
          ? await service.getPage(filters, paging)
          : { items: await service.getAll(filters), meta: undefined },
      { query: req.query },
    );
    if (result.meta) {
      sendPaged(res, result.items, MSG.employees.retrieved, result.meta);
      return;
    }
    res.json(formatSuccess(result.items, MSG.employees.retrieved));
  } catch (err) {
    next(err);
  }
};

export const getById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.getById(parseIdParam(req.params.id, "id"));
    res.json(formatSuccess(data, MSG.employees.single));
  } catch (err) {
    next(err);
  }
};

export const getMe = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.getMyEmployeeRecord(req.authUser!.id, req.authUser!.email);
    res.json(formatSuccess(data, MSG.employees.single));
  } catch (err) {
    next(err);
  }
};

export const create = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.create(req.body);
    await logAudit({
      entityType: "employee",
      entityId: String(data.id),
      action: "created",
      actor: req.authUser?.name ?? "unknown",
      summary: `Added employee ${data.name}`,
    });
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.employees.created));
  } catch (err) {
    next(err);
  }
};

export const update = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.update(parseIdParam(req.params.id, "id"), req.body);
    await logAudit({
      entityType: "employee",
      entityId: String(req.params.id),
      action: "updated",
      actor: req.authUser?.name ?? "unknown",
      summary: `Updated employee ${data.name}`,
    });
    res.json(formatSuccess(data, MSG.employees.updated));
  } catch (err) {
    next(err);
  }
};

export const remove = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.remove(parseIdParam(req.params.id, "id"));
    await logAudit({
      entityType: "employee",
      entityId: String(req.params.id),
      action: "deleted",
      actor: req.authUser?.name ?? "unknown",
      summary: `Removed employee ${data.name}`,
    });
    res.json(formatSuccess(data, MSG.employees.deleted));
  } catch (err) {
    next(err);
  }
};

export const deactivate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.deactivate(parseIdParam(req.params.id, "id"));
    res.json(formatSuccess(data, "Employee deactivated"));
  } catch (err) {
    next(err);
  }
};
