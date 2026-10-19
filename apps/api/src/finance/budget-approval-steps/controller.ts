import { NextFunction, Request, Response } from "express";
import { HTTP } from "../../core/config/http-status.js";
import { MSG } from "../../core/config/messages.js";
import { formatSuccess } from "../../core/utils/response.js";
import * as service from "./service.js";
import { byDate, byString, respondList } from "../../core/utils/pagination.js";

export const getAll = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const budgetId = req.query.budgetId
      ? Number(req.query.budgetId)
      : undefined;
    const data = await service.getAll({ budgetId });
    respondList(res, req.query, data, MSG.budgetApprovalSteps.retrieved, {
      decidedAt: byDate((s) => s.decidedAt),
      stage: byString((s) => s.stage),
    });
  } catch (err) {
    next(err);
  }
};

export const decide = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.decide(req.body);
    res
      .status(HTTP.CREATED)
      .json(formatSuccess(data, MSG.budgetApprovalSteps.created));
  } catch (err) {
    next(err);
  }
};
