import { NextFunction, Response } from "express";
import { unlink } from "node:fs/promises";

import { HTTP } from "../core/config/http-status.js";
import { MSG } from "../core/config/messages.js";
import { formatSuccess } from "../core/utils/response.js";
import { logAudit } from "../core/audit/audit.js";

import * as service from "./service.js";
import { assertDiskFileMatches } from "../uploads/sniff.js";
import { recordFromDisk } from "../uploads/integrity/record.js";
import { assignedCodesFor, isAssignedScoped } from "../projects/scope.js";

import type { AuthedRequest } from "../core/auth/middleware.js";
import { parsePageRequest, sendPaged } from "../core/utils/pagination.js";
import { DOCUMENT_SORT_COLUMNS } from "./repository.js";
import { parseIdParam } from "../core/utils/params.js";
import * as reportsService from "../reports/service.js";
import { ValidationError } from "../core/utils/errors.js";

export const getAll = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const projectCodes =
      req.authUser?.role === "project-manager"
        ? await service.findProjectCodesForPm(req.authUser.name)
        : isAssignedScoped(req.authUser)
          ? [...(await assignedCodesFor(req.authUser))]
          : undefined;

    const filters = {
      project: req.query.project as string,
      type: req.query.type as string,
      stage: req.query.stage as string,
      projectCodes,
    };
    const paging = parsePageRequest(req.query, { sortable: Object.keys(DOCUMENT_SORT_COLUMNS) });
    if (paging.requested) {
      const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim() : undefined;
      const { items, meta } = await service.getPage({ ...filters, search }, paging);
      const typeCounts = req.query.counts === "1" ? await service.typeCounts(filters) : undefined;
      return sendPaged(res, items, MSG.documents.retrieved, typeCounts ? { ...meta, typeCounts } : meta);
    }
    const data = await service.getAll(filters);

    return res.json(
      formatSuccess(
        data,
        MSG.documents.retrieved,
      ),
    );
  } catch (err) {
    return next(err);
  }
};

export const create = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.create(
      {
        ...req.body,
        uploadedBy:
          req.body.uploadedBy ??
          req.authUser!.email,
      },
      req.authUser?.role,
    );

    return res
      .status(HTTP.CREATED)
      .json(
        formatSuccess(
          data,
          MSG.documents.created,
        ),
      );
  } catch (err) {
    return next(err);
  }
};

export const remove = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.remove(parseIdParam(req.params.id, "id"));
    await logAudit({
      entityType: "document",
      entityId: String(data?.documentId ?? req.params.id),
      action: "deleted",
      actor: req.authUser?.name ?? "unknown",
      summary: `Deleted document "${data?.title}" (${data?.documentId}) from project ${data?.project}`,
      projectCode: data?.project,
    });
    return res.json(formatSuccess(data, "Document deleted"));
  } catch (err) {
    return next(err);
  }
};

export const upload = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please select a file to upload.",
        code: "FILE_REQUIRED",
      });
    }

    // Refuse (and delete) a file whose bytes are not the type it claims, before anything else.
    await assertDiskFileMatches(req.file.path, req.file.originalname, req.file.mimetype || "");

    const project = String(
      req.body.project ?? "",
    ).trim();

    const type = String(
      req.body.type ?? "",
    ).trim();

    const version = String(
      req.body.version ?? "v1",
    ).trim() || "v1";

    const title =
      String(
        req.body.title ?? "",
      ).trim() ||
      req.file.originalname;

    if (!project) {
      await unlink(req.file.path).catch(() => undefined);
      return res.status(400).json({
        success: false,
        message: "Project is required.",
        code: "PROJECT_REQUIRED",
      });
    }

    if (!type) {
      await unlink(req.file.path).catch(() => undefined);
      return res.status(400).json({
        success: false,
        message: "Document type is required.",
        code: "TYPE_REQUIRED",
      });
    }

    const stage = String(req.body.stage ?? "").trim() || undefined;

    let data;
    try {
      data = await service.upload({
        file: req.file,
        title,
        project,
        type,
        version,
        uploadedBy: req.authUser!.email,
        stage,
        relatedType: String(req.body.relatedType ?? "").trim() || undefined,
        relatedId: String(req.body.relatedId ?? "").trim() || undefined,
        reportPeriod: String(req.body.reportPeriod ?? "").trim() || undefined,
        periodDate: String(req.body.periodDate ?? "").trim() || undefined,
      });
    } catch (err) {
      // The file is already on disk; do not leave it orphaned when the
      // request is refused (archived project, bad related item, ...).
      await unlink(req.file.path).catch(() => undefined);
      throw err;
    }

    // Fingerprint the stored file (read from disk in chunks) so a later change or corruption is noticed.
    if (data?.fileUrl) {
      await recordFromDisk({
        url: data.fileUrl,
        absolutePath: req.file.path,
        contentType: req.file.mimetype || "application/octet-stream",
        uploadedByUserId: req.authUser?.id,
      });
    }

    return res
      .status(HTTP.CREATED)
      .json(
        formatSuccess(
          data,
          MSG.documents.created,
        ),
      );
  } catch (err) {
    return next(err);
  }
};
export const reportStatus = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const project = typeof req.query.project === "string" ? req.query.project.trim() : "";
    if (!project) throw new ValidationError("project is required");
    res.json(formatSuccess(await reportsService.getStatus(project, req.authUser!), "Report status retrieved"));
  } catch (err) {
    next(err);
  }
};
