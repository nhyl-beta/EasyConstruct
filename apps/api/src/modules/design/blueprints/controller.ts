// controller.ts
import { NextFunction, Request, Response } from "express";
import { HTTP } from "../../../core/config/http-status.js";
import { MSG } from "../../../core/config/messages.js";
import { formatSuccess } from "../../../core/utils/response.js";
import * as service from "./service.js";
import { byDate, byString, respondList } from "../../../core/utils/pagination.js";
import type { AuthedRequest } from "../../../core/auth/middleware.js";
import { assertAssignedToDesign, assertAssignedToProject, scopeRowsByDesign } from "../../projects/index.js";
import { parseIdParam } from "../../../core/utils/params.js";

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
// Read, edit, decide and delete all follow the same rule: you must be assigned to the drawing's project.
const loadAssigned = async (req: Request) => {
  const bp = await service.getById(parseIdParam(req.params.id, "id"));
  const auth = (req as AuthedRequest).authUser;
  if (bp.projectCode) await assertAssignedToProject(auth, bp.projectCode, "blueprints");
  else await assertAssignedToDesign(auth, bp.designId, "blueprints");
  return bp;
};
export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(formatSuccess(await loadAssigned(req), MSG.blueprints.single)); }
  catch (err) { next(err); }
};
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const auth = (req as AuthedRequest).authUser!;
    if (req.body.projectCode) await assertAssignedToProject(auth, req.body.projectCode, "blueprints");
    const data = await service.create({ ...req.body, author: auth.name });
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.blueprints.created));
  } catch (err) { next(err); }
};
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bp = await loadAssigned(req);
    res.json(formatSuccess(await service.update(bp.id, req.body), MSG.blueprints.updated));
  } catch (err) { next(err); }
};
export const decide = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bp = await loadAssigned(req);
    const data = await service.decide({ id: bp.id, approval: req.body.approval });
    res.json(formatSuccess(data, MSG.blueprints.updated));
  } catch (err) { next(err); }
};
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bp = await loadAssigned(req);
    res.json(formatSuccess(await service.remove(bp.id), MSG.blueprints.deleted));
  } catch (err) { next(err); }
};