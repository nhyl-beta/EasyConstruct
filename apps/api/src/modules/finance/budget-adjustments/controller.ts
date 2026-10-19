import { NextFunction, Request, Response } from "express";
import { HTTP } from "../../../core/config/http-status.js";
import { MSG } from "../../../core/config/messages.js";
import { formatSuccess } from "../../../core/utils/response.js";
import * as service from "./service.js";
import type { BudgetAdjustmentFilters } from "./types.js";
import { byDate, byString, respondList } from "../../../core/utils/pagination.js";
import { parseIdParam } from "../../../core/utils/params.js";

export const getAll = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters: BudgetAdjustmentFilters = {
      budgetId: req.query.budgetId ? Number(req.query.budgetId) : undefined,
      kind: req.query.kind as string,
      status: req.query.status as string,
      search: req.query.search as string,
    };
    respondList(res, req.query, await service.getAll(filters), MSG.budgetAdjustments.retrieved, {
      requestedAt: byDate((a) => a.requestedAt),
      status: byString((a) => a.status),
      kind: byString((a) => a.kind),
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
    res.json(
      formatSuccess(
        await service.getById(parseIdParam(req.params.id, "id")),
        MSG.budgetAdjustments.single,
      ),
    );
  } catch (err) {
    next(err);
  }
};

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res
      .status(HTTP.CREATED)
      .json(
        formatSuccess(
          await service.create(req.body),
          MSG.budgetAdjustments.created,
        ),
      );
  } catch (err) {
    next(err);
  }
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(
      formatSuccess(
        await service.update(parseIdParam(req.params.id, "id"), req.body),
        MSG.budgetAdjustments.updated,
      ),
    );
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
    res.json(
      formatSuccess(
        await service.remove(parseIdParam(req.params.id, "id")),
        MSG.budgetAdjustments.deleted,
      ),
    );
  } catch (err) {
    next(err);
  }
};
