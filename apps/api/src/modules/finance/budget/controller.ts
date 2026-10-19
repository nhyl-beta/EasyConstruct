import { NextFunction, Request, Response } from "express";
import { HTTP } from "../../../core/config/http-status.js";
import { MSG } from "../../../core/config/messages.js";
import { formatSuccess } from "../../../core/utils/response.js";
import { logAudit } from "../../../core/audit/audit.js";
import type { AuthedRequest } from "../../../core/auth/middleware.js";
import { parseIdParam } from "../../../core/utils/params.js";
import * as service from "./service.js";
import type { BudgetFilters, BudgetStatus } from "./types.js";
import { byDate, byNumber, byString, respondList } from "../../../core/utils/pagination.js";
import { assertProjectVisible, scopeRowsToVisible } from "../../projects/index.js";

const validStatuses: readonly BudgetStatus[] = [
  "draft",
  "pending-review",
  "finance-review",
  "manager-review",
  "approved",
  "rejected",
  "locked",
];

export const getAll = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const status = req.query.status;

    const filters: BudgetFilters = {
      fiscalYear:
        typeof req.query.fiscalYear === "string"
          ? req.query.fiscalYear
          : undefined,

      search:
        typeof req.query.search === "string" ? req.query.search : undefined,

      status:
        status === "all"
          ? "all"
          : typeof status === "string" &&
              validStatuses.includes(status as BudgetStatus)
            ? (status as BudgetStatus)
            : undefined,
    };

    // A Project Manager only gets the budget lines of the projects they manage.
    const data = await scopeRowsToVisible((req as AuthedRequest).authUser, await service.getAll(filters), (b) => b.project);

    respondList(res, req.query, data, MSG.budgets.retrieved, {
      project: byString((b) => b.project),
      category: byString((b) => b.category),
      status: byString((b) => b.status),
      planned: byNumber((b) => b.planned),
      updatedAt: byDate((b) => b.updatedAt),
    });
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
    const data = await service.getById(parseIdParam(req.params.id));
    await assertProjectVisible((req as AuthedRequest).authUser, data.project, "budgets");

    res.json(formatSuccess(data, MSG.budgets.single));
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
      entityType: "budget",
      entityId: String(data.id),
      action: "created",
      actor: req.authUser?.name ?? "unknown",
      summary: `Created budget for ${data.project} (${data.category})`,
      projectCode: data.project,
    });

    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.budgets.created));
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
      entityType: "budget",
      entityId: String(req.params.id),
      action: "updated",
      actor: req.authUser?.name ?? "unknown",
      summary: `Updated budget for ${data.project} (${data.category})`,
      projectCode: data.project,
    });

    res.json(formatSuccess(data, MSG.budgets.updated));
  } catch (err) {
    next(err);
  }
};

export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.remove(parseIdParam(req.params.id, "id"));

    res.json(formatSuccess(data, MSG.budgets.deleted));
  } catch (err) {
    next(err);
  }
};
