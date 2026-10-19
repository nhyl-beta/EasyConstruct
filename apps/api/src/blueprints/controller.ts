// controller.ts
import { NextFunction, Request, Response } from "express";
import { HTTP } from "../constants/http-status.js";
import { MSG } from "../constants/messages.js";
import { formatSuccess } from "../utils/response.js";
import * as service from "./service.js";
import { byDate, byString, respondList } from "../utils/pagination.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { assertAssignedToDesign, assertAssignedToProject, scopeRowsByDesign } from "../projects/scope.js";
import { parseIdParam } from "../utils/params.js";

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await scopeRowsByDesign(
      (req as AuthedRequest).authUser,
      await service.getAll({
        folder: req.query.folder as string,
        search: req.query.search as string,
        projectCode: req.query.projectCode as string,
      }),
      (b) => b.designId,
      (b) => b.projectCode,
    );
    respondList(res, req.query, data, MSG.blueprints.retrieved, {
      title: byString((b) => b.title),
      drawingNumber: byString((b) => b.drawingNumber),
      folder: byString((b) => b.folder),
      approval: byString((b) => b.approval),
      status: byString((b) => b.status),
      issueDate: byDate((b) => b.issueDate),
    });
  } catch (err) { next(err); }
};
export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bp = await service.getById(parseIdParam(req.params.id, "id"));
    const auth = (req as AuthedRequest).authUser;
    if (bp.projectCode) await assertAssignedToProject(auth, bp.projectCode, "blueprints");
    else await assertAssignedToDesign(auth, bp.designId, "blueprints");
    res.json(formatSuccess(bp, MSG.blueprints.single));
  } catch (err) { next(err); }
};
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.create(req.body);
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.blueprints.created));
  } catch (err) { next(err); }
};
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(formatSuccess(await service.update(parseIdParam(req.params.id, "id"), req.body), MSG.blueprints.updated)); }
  catch (err) { next(err); }
};
export const decide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.decide({ id: parseIdParam(req.params.id, "id"), approval: req.body.approval });
    res.json(formatSuccess(data, MSG.blueprints.updated));
  } catch (err) { next(err); }
};
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(formatSuccess(await service.remove(parseIdParam(req.params.id, "id")), MSG.blueprints.deleted)); }
  catch (err) { next(err); }
};