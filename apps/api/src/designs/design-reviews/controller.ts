import { NextFunction, Request, Response } from "express";
import { HTTP } from "../../core/config/http-status.js";
import { MSG } from "../../core/config/messages.js";
import { formatSuccess } from "../../core/utils/response.js";
import * as service from "./service.js";
import { byDate, byString, respondList } from "../../core/utils/pagination.js";
import type { AuthedRequest } from "../../core/auth/middleware.js";
import { assertAssignedToDesign, scopeRowsByDesign } from "../../projects/scope.js";
import { parseIdParam } from "../../core/utils/params.js";

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await scopeRowsByDesign(
      (req as AuthedRequest).authUser,
      await service.getAll({
        designId: req.query.designId ? Number(req.query.designId) : undefined,
        status: req.query.status as string,
      }),
      (r) => r.designId,
    );
    respondList(res, req.query, data, MSG.designReviews.retrieved, {
      code: byString((r) => r.code),
      status: byString((r) => r.status),
      priority: byString((r) => r.priority),
      submittedAt: byDate((r) => r.submittedAt),
      dueDate: byDate((r) => r.dueDate),
    });
  } catch (err) { next(err); }
};
export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const review = await service.getById(parseIdParam(req.params.id, "id"));
    await assertAssignedToDesign((req as AuthedRequest).authUser, review.designId, "design reviews");
    res.json(formatSuccess(review, MSG.designReviews.single));
  } catch (err) { next(err); }
};
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.create(req.body);
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.designReviews.created));
  } catch (err) { next(err); }
};
export const decide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.decide({ id: parseIdParam(req.params.id, "id"), decision: req.body.decision });
    res.json(formatSuccess(data, MSG.designReviews.updated));
  } catch (err) { next(err); }
};
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(formatSuccess(await service.remove(parseIdParam(req.params.id, "id")), MSG.designReviews.deleted));
  } catch (err) { next(err); }
};