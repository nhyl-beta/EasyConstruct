// apps/api/src/transmittals/controller.ts
import { NextFunction, Response } from "express";
import { HTTP } from "../constants/http-status.js";
import { formatSuccess } from "../utils/response.js";
import { UnauthorizedError } from "../utils/errors.js";
import type { AuthedRequest } from "../middleware/auth.js";
import * as service from "./service.js";
import { byDate, byString, respondList } from "../utils/pagination.js";
import { parseIdParam } from "../utils/params.js";

const actorOf = (req: AuthedRequest): service.Actor => {
  const u = req.authUser;
  if (!u) throw new UnauthorizedError("Not signed in");
  return { id: u.id, name: u.name, role: u.role };
};
const id = (req: AuthedRequest) => parseIdParam(req.params.id, "id");
const wrap =
  (fn: (req: AuthedRequest, res: Response) => Promise<void>) =>
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (err) {
      next(err);
    }
  };

export const list = wrap(async (req, res) => {
  const projectCode = typeof req.query.projectCode === "string" && req.query.projectCode ? req.query.projectCode : undefined;
  respondList(res, req.query, await service.list(projectCode, actorOf(req)), "Transmittals retrieved", {
    controlNo: byString((t) => t.controlNo),
    subject: byString((t) => t.subject),
    projectCode: byString((t) => t.projectCode),
    status: byString((t) => t.status),
    dateIssued: byString((t) => t.dateIssued),
    createdAt: byDate((t) => t.createdAt),
  });
});
export const getById = wrap(async (req, res) => {
  res.json(formatSuccess(await service.getById(id(req), actorOf(req)), "Transmittal retrieved"));
});
export const create = wrap(async (req, res) => {
  res.status(HTTP.CREATED).json(formatSuccess(await service.create(req.body, actorOf(req)), "Transmittal created"));
});
export const update = wrap(async (req, res) => {
  res.json(formatSuccess(await service.update(id(req), req.body, actorOf(req)), "Transmittal updated"));
});
export const issue = wrap(async (req, res) => {
  res.json(formatSuccess(await service.issue(id(req), actorOf(req)), "Transmittal issued"));
});
export const acknowledge = wrap(async (req, res) => {
  res.status(HTTP.CREATED).json(formatSuccess(await service.acknowledge(id(req), req.body, actorOf(req)), "Receipt logged"));
});
