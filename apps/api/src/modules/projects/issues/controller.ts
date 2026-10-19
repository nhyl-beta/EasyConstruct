// apps/api/src/issues/controller.ts — NEW
import { NextFunction, Response } from "express";
import { HTTP } from "../../../core/config/http-status.js";
import { MSG } from "../../../core/config/messages.js";
import { formatSuccess } from "../../../core/utils/response.js";
import { logAudit } from "../../../core/audit/audit.js";
import * as service from "./service.js";
import type { AuthedRequest } from "../../../core/auth/middleware.js";
import type { IssueFilters } from "./types.js";
import { assertProjectVisible, scopeRowsToVisible, scopedProjectCodes } from "../projects/service.js";
import { parsePageRequest, sendPaged } from "../../../core/utils/pagination.js";
import { ISSUE_SORT_COLUMNS } from "./repository.js";
import { parseIdParam } from "../../../core/utils/params.js";

export const getAll = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const filters: IssueFilters = {
      projectCode: req.query.projectCode as string,
      status: req.query.status as string,
      // NOTE: was comparing against "site_personnel" (underscore) while every
      // JWT/requireRole check in this codebase uses "site-personnel"
      // (hyphen) — the scoping never applied. Fixed to the real role string.
      reportedByUserId:
        req.authUser?.role === "site-personnel" ? req.authUser.id : undefined,
    };
    const paging = parsePageRequest(req.query, { sortable: Object.keys(ISSUE_SORT_COLUMNS) });
    if (paging.requested) {
      const codes = await scopedProjectCodes(req.authUser, { skipRoles: ["site-personnel"] });
      const { items, meta } = await service.getPage({ ...filters, ...(codes ? { codes } : {}) }, paging);
      const counts = req.query.counts === "1" ? await service.headlineCounts({ ...filters, ...(codes ? { codes } : {}) }) : undefined;
      sendPaged(res, items, MSG.issues.retrieved, counts ? { ...meta, ...counts } : meta);
      return;
    }
    const data = await scopeRowsToVisible(req.authUser, await service.getAll(filters), (i) => i.projectCode, { skipRoles: ["site-personnel"] });
    res.json(formatSuccess(data, MSG.issues.retrieved));
  } catch (err) {
    next(err);
  }
};

// ai-signals E5
export const getPrecedents = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.getPrecedentsByCategory(req.params.category as string);
    res.json(formatSuccess(data, "Issue precedents retrieved"));
  } catch (err) {
    next(err);
  }
};

// B2
export const getPrecedentsForIssue = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.getPrecedentsForIssue(parseIdParam(req.params.id, "id"), req.authUser);
    res.json(formatSuccess(data, "Similar resolved issues retrieved"));
  } catch (err) {
    next(err);
  }
};

export const getById =async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.getById(parseIdParam(req.params.id, "id"));
    if (req.authUser?.role !== "site-personnel") await assertProjectVisible(req.authUser, data.projectCode, "issues");
    res.json(formatSuccess(data, MSG.issues.single));
  } catch (err) {
    next(err);
  }
};

export const create = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.create({
      ...req.body,
      reportedByUserId: req.authUser!.id,
      reportedByName: req.body.reportedByName ?? req.authUser!.email,
      reportedByRole: req.authUser!.role,
    });
    await logAudit({
      entityType: "issue",
      entityId: String(data.id),
      action: "created",
      actor: req.authUser?.name ?? "unknown",
      summary: `Reported issue "${data.title}" for project ${data.projectCode}`,
      projectCode: data.projectCode,
    });
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.issues.created));
  } catch (err) {
    next(err);
  }
};

export const updateStatus = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.updateStatus(
      parseIdParam(req.params.id, "id"),
      req.body.status,
      req.body.resolutionNotes,
      req.authUser!.role,
      { id: req.authUser!.id, name: req.authUser!.name },
    );
    await logAudit({
      entityType: "issue",
      entityId: String(req.params.id),
      action: req.body.status === "Resolved" ? "resolved" : "updated",
      actor: req.authUser?.name ?? "unknown",
      summary: `Issue "${data.title}" status changed to ${req.body.status}`,
      projectCode: data.projectCode,
    });
    res.json(formatSuccess(data, MSG.issues.updated));
  } catch (err) {
    next(err);
  }
};