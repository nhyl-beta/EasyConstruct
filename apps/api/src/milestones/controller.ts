// apps/api/src/milestones/controller.ts — NEW
import { NextFunction, Response } from "express";
import { HTTP } from "../constants/http-status.js";
import { MSG } from "../constants/messages.js";
import { formatSuccess } from "../utils/response.js";
import { logAudit } from "../utils/audit.js";
import * as service from "./service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { assertProjectVisible, scopeRowsToVisible, scopedProjectCodes } from "../projects/service.js";
import { parsePageRequest, sendPaged } from "../utils/pagination.js";
import { MILESTONE_SORT_COLUMNS } from "./repository.js";
import { parseIdParam } from "../utils/params.js";

export const getAll = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const paging = parsePageRequest(req.query, { sortable: Object.keys(MILESTONE_SORT_COLUMNS) });
    if (paging.requested) {
      const codes = await scopedProjectCodes(req.authUser);
      const projectCode = typeof req.query.projectCode === "string" && req.query.projectCode ? req.query.projectCode : undefined;
      const { items, meta } = await service.getPage({ projectCode, ...(codes ? { codes } : {}) }, paging);
      sendPaged(res, items, MSG.milestones.retrieved, meta);
      return;
    }
    const data = await scopeRowsToVisible(
      req.authUser,
      await service.getAll(req.query.projectCode as string | undefined),
      (m) => m.projectCode,
    );
    res.json(formatSuccess(data, MSG.milestones.retrieved));
  } catch (err) {
    next(err);
  }
};

export const getById = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.getById(parseIdParam(req.params.id, "id"));
    await assertProjectVisible(req.authUser, data.projectCode, "milestones");
    res.json(formatSuccess(data, MSG.milestones.single));
  } catch (err) {
    next(err);
  }
};

export const create = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const createdBy = req.authUser?.name ?? req.authUser?.email ?? "unknown";
    const data = await service.create(req.body, createdBy);
    await logAudit({
      entityType: "milestone",
      entityId: String(data.id),
      action: "created",
      actor: createdBy,
      summary: `Created draft milestone "${data.title}" for project ${data.projectCode}`,
      projectCode: data.projectCode,
    });
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.milestones.created));
  } catch (err) {
    next(err);
  }
};

export const update = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.authUser?.name ?? req.authUser?.email ?? "unknown";
    const data = await service.update(
      parseIdParam(req.params.id, "id"),
      req.body,
      req.authUser ? { id: req.authUser.id, role: req.authUser.role, name: actor } : undefined,
    );
    await logAudit({
      entityType: "milestone",
      entityId: String(data.id),
      action: "updated",
      actor,
      summary: `Updated milestone "${data.title}"`,
      projectCode: data.projectCode,
    });
    res.json(formatSuccess(data, MSG.milestones.updated));
  } catch (err) {
    next(err);
  }
};

export const remove = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.authUser?.name ?? req.authUser?.email ?? "unknown";
    const data = await service.remove(parseIdParam(req.params.id, "id"));
    await logAudit({
      entityType: "milestone",
      entityId: String(req.params.id),
      action: "deleted",
      actor,
      summary: `Deleted milestone "${data.title}"`,
      projectCode: data.projectCode,
    });
    res.json(formatSuccess(data, MSG.milestones.deleted));
  } catch (err) {
    next(err);
  }
};

export const createLink = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.createLink(
      parseIdParam(req.params.id, "id"),
      req.body,
      req.authUser?.role ?? "",
    );
    await logAudit({
      entityType: "milestone",
      entityId: String(req.params.id),
      action: "linked",
      actor: req.authUser?.name ?? "unknown",
      summary: `Linked ${req.body.linkType} #${req.body.linkId} to milestone "${data.title}"`,
      projectCode: data.projectCode,
    });
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.milestones.updated));
  } catch (err) {
    next(err);
  }
};

export const removeLink = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.removeLink(
      parseIdParam(req.params.id, "id"),
      parseIdParam(req.params.linkId, "linkId"),
      req.authUser?.role ?? "",
    );
    await logAudit({
      entityType: "milestone",
      entityId: String(req.params.id),
      action: "unlinked",
      actor: req.authUser?.name ?? "unknown",
      summary: `Removed link #${req.params.linkId} from milestone "${data.title}"`,
      projectCode: data.projectCode,
    });
    res.json(formatSuccess(data, MSG.milestones.updated));
  } catch (err) {
    next(err);
  }
};
