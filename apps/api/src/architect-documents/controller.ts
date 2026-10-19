// controller.ts
import { NextFunction, Request, Response } from "express";
import { HTTP } from "../core/config/http-status.js";
import { MSG } from "../core/config/messages.js";
import { formatSuccess } from "../core/utils/response.js";
import * as service from "./service.js";
import { byDate, byString, respondList } from "../core/utils/pagination.js";
import type { AuthedRequest } from "../core/auth/middleware.js";
import { assertAssignedToDesign, assertAssignedToProject, scopeRowsByDesign } from "../projects/scope.js";
import { parseIdParam } from "../core/utils/params.js";

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await scopeRowsByDesign(
      (req as AuthedRequest).authUser,
      await service.getAll({ category: req.query.category as string, search: req.query.search as string }),
      (d) => d.designId,
      // Plans started from the Revisions page belong to a project directly.
      (d) => d.projectCode,
    );
    respondList(res, req.query, data, MSG.architectDocuments.retrieved, {
      title: byString((d) => d.title),
      category: byString((d) => d.category),
      status: byString((d) => d.status),
      updatedAt: byDate((d) => d.updatedAt),
    });
  } catch (err) { next(err); }
};
export const getById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await service.getById(parseIdParam(req.params.id, "id"));
    if (doc.projectCode) await assertAssignedToProject((req as AuthedRequest).authUser, doc.projectCode, "documents");
    else await assertAssignedToDesign((req as AuthedRequest).authUser, doc.designId, "documents");
    res.json(formatSuccess(doc, MSG.architectDocuments.single));
  } catch (err) { next(err); }
};
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await service.create(req.body);
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.architectDocuments.created));
  } catch (err) { next(err); }
};
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(formatSuccess(await service.update(parseIdParam(req.params.id, "id"), req.body), MSG.architectDocuments.updated)); }
  catch (err) { next(err); }
};
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(formatSuccess(await service.remove(parseIdParam(req.params.id, "id")), MSG.architectDocuments.deleted)); }
  catch (err) { next(err); }
};