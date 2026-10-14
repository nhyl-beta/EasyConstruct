// server/src/design-requests/controller.ts
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

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap = (fn: Handler) => async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

export const list = wrap(async (req, res) => {
  const q = req.query;
  const data = await service.list(
    {
      projectCode: typeof q.projectCode === "string" && q.projectCode ? q.projectCode : undefined,
      kind: typeof q.kind === "string" && q.kind ? q.kind : undefined,
      status: typeof q.status === "string" && q.status ? q.status : undefined,
      search: typeof q.search === "string" && q.search ? q.search : undefined,
      box: q.box === "raised" || q.box === "inbox" ? q.box : undefined,
      overdue: q.overdue === "true",
    },
    actorOf(req),
  );
  // Visibility and the overdue flag are applied per row after the read, so
  // the page is cut from the scoped rows (the response is bounded).
  respondList(res, q, data, "Requests retrieved", {
    number: byString((r: service.DesignRequestView) => r.number),
    subject: byString((r: service.DesignRequestView) => r.subject),
    projectCode: byString((r: service.DesignRequestView) => r.projectCode),
    status: byString((r: service.DesignRequestView) => r.status),
    dueDate: byDate((r: service.DesignRequestView) => r.dueDate),
    createdAt: byDate((r: service.DesignRequestView) => r.createdAt),
  });
});

export const getById = wrap(async (req, res) => {
  res.json(formatSuccess(await service.getById(id(req), actorOf(req)), "Request retrieved"));
});

export const assignees = wrap(async (req, res) => {
  const projectCode = typeof req.query.projectCode === "string" ? req.query.projectCode : "";
  res.json(formatSuccess(await service.getAssignees(projectCode, actorOf(req)), "Assignees retrieved"));
});

export const create = wrap(async (req, res) => {
  res.status(HTTP.CREATED).json(formatSuccess(await service.create(req.body, actorOf(req)), "Request created"));
});

export const update = wrap(async (req, res) => {
  res.json(formatSuccess(await service.update(id(req), req.body, actorOf(req)), "Request updated"));
});

export const send = wrap(async (req, res) => {
  res.json(formatSuccess(await service.send(id(req), actorOf(req), req.body?.dueDays), "Request sent"));
});

export const acknowledge = wrap(async (req, res) => {
  res.json(formatSuccess(await service.acknowledge(id(req), actorOf(req)), "Request acknowledged"));
});

export const respond = wrap(async (req, res) => {
  res.json(formatSuccess(await service.respond(id(req), req.body, actorOf(req)), "Response recorded"));
});

export const close = wrap(async (req, res) => {
  res.json(formatSuccess(await service.close(id(req), actorOf(req)), "Request closed"));
});

export const followUp = wrap(async (req, res) => {
  res.status(HTTP.CREATED).json(formatSuccess(await service.followUp(id(req), req.body, actorOf(req)), "Follow-up created"));
});

export const returned = wrap(async (req, res) => {
  res.json(formatSuccess(await service.recordReturned(id(req), req.body, actorOf(req)), "Returned document recorded"));
});

export const attention = wrap(async (_req, res) => {
  res.json(formatSuccess(await service.getAttention(), "Needs attention"));
});

export const sweep = wrap(async (_req, res) => {
  res.json(formatSuccess(await service.sweepOverdue(), "Overdue check complete"));
});
