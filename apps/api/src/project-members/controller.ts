import { NextFunction, Response } from "express";
import { HTTP } from "../constants/http-status.js";
import { formatSuccess } from "../utils/response.js";
import { logAudit } from "../utils/audit.js";
import type { AuthedRequest } from "../middleware/auth.js";
import * as service from "./service.js";
import type { ProjectMemberRole } from "./types.js";
import { parsePageRequest, sendPaged } from "../utils/pagination.js";
import { MEMBER_SORT_COLUMNS } from "./repository.js";
import { parseIdParam } from "../utils/params.js";

export const getAll = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filters = {
      projectCode: req.query.projectCode as string,
      userId: req.query.userId ? Number(req.query.userId) : undefined,
      role: req.query.role as ProjectMemberRole | undefined,
    };
    const paging = parsePageRequest(req.query, { sortable: Object.keys(MEMBER_SORT_COLUMNS), defaultOrder: "asc" });
    if (paging.requested) {
      const { items, meta } = await service.getPage(filters, paging);
      sendPaged(res, items, "Project members retrieved", meta);
      return;
    }
    const data = await service.getAll(filters);
    res.json(formatSuccess(data, "Project members retrieved"));
  } catch (err) {
    next(err);
  }
};

export const create = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.create(
      {
        ...req.body,
        addedBy: req.authUser?.name ?? "unknown",
      },
      req.authUser?.role ?? "",
      req.authUser?.name ?? "",
    );
    await logAudit({
      entityType: "project_member",
      entityId: String(data.id),
      action: "created",
      actor: req.authUser?.name ?? "unknown",
      summary: `Added ${data.userName} to project ${data.projectCode} as ${data.role}`,
      projectCode: data.projectCode,
    });
    res.status(HTTP.CREATED).json(formatSuccess(data, "Project member added"));
  } catch (err) {
    next(err);
  }
};

export const remove = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.remove(
      parseIdParam(req.params.id, "id"),
      req.authUser?.role ?? "",
      req.authUser?.name ?? "",
    );
    await logAudit({
      entityType: "project_member",
      entityId: String(req.params.id),
      action: "deleted",
      actor: req.authUser?.name ?? "unknown",
      summary: `Removed ${data.userName} (${data.role}) from project ${data.projectCode}`,
      projectCode: data.projectCode,
    });
    res.json(formatSuccess(data, "Project member removed"));
  } catch (err) {
    next(err);
  }
};
