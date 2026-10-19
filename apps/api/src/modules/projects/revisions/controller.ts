// apps/api/src/revisions/controller.ts
import { NextFunction, Response } from "express";
import { pipeline } from "node:stream/promises";
import { HTTP } from "../../../core/config/http-status.js";
import { formatSuccess } from "../../../core/utils/response.js";
import { logAudit } from "../../../core/audit/audit.js";
import { ValidationError } from "../../../core/utils/errors.js";
import type { AuthedRequest } from "../../../core/auth/middleware.js";
import * as service from "./service.js";
import { REVISION_ITEM_TYPES, REVISION_STATUSES, type RevisionItemType, type RevisionStatus } from "./rules.js";
import type { RevisionActor } from "./types.js";
import { parsePageRequest, sendPaged } from "../../../core/utils/pagination.js";
import { REVISION_SORT_COLUMNS } from "./repository.js";
import { parseIdParam } from "../../../core/utils/params.js";

const actorOf = (req: AuthedRequest): RevisionActor => {
  const u = req.authUser;
  if (!u) throw new ValidationError("Not signed in");
  return { id: u.id, name: u.name, role: u.role };
};

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isInteger(n) ? n : undefined;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], label: string): T | undefined => {
  const s = str(v);
  if (s === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(s)) throw new ValidationError(`Unknown ${label}: ${s}`);
  return s as T;
};

export const getAll = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const q = req.query;
    const { items, meta } = await service.list(
      {
        project: str(q.project),
        itemType: oneOf<RevisionItemType>(q.itemType, REVISION_ITEM_TYPES, "item type"),
        itemId: num(q.itemId),
        status: oneOf<RevisionStatus>(q.status, REVISION_STATUSES, "status"),
        architectId: num(q.architectId),
        dateFrom: str(q.dateFrom),
        dateTo: str(q.dateTo),
        search: str(q.search),
        currentOnly: q.currentOnly === "1" || q.currentOnly === "true",
      },
      parsePageRequest(q, { enforce: true, sortable: Object.keys(REVISION_SORT_COLUMNS) }),
      actorOf(req),
    );
    sendPaged(res, items, "Revisions retrieved", meta);
  } catch (err) {
    next(err);
  }
};

export const getSummary = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(formatSuccess(await service.summary(actorOf(req)), "Revision summary retrieved"));
  } catch (err) {
    next(err);
  }
};

export const getById = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(formatSuccess(await service.getById(parseIdParam(req.params.id, "id"), actorOf(req)), "Revision retrieved"));
  } catch (err) {
    next(err);
  }
};

export const getHistory = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    res.json(
      formatSuccess(
        await service.history(String(req.params.itemType), parseIdParam(req.params.itemId, "itemId"), actorOf(req)),
        "Revision history retrieved",
      ),
    );
  } catch (err) {
    next(err);
  }
};

export const compare = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const left = num(req.query.left);
    const right = num(req.query.right);
    if (left === undefined || right === undefined) throw new ValidationError("left and right revision ids are required");
    res.json(formatSuccess(await service.compare(left, right, actorOf(req)), "Revisions compared"));
  } catch (err) {
    next(err);
  }
};

export const create = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const created = await service.create(req.body, actorOf(req));
    await logAudit({
      entityType: "revision",
      entityId: String(created.id),
      action: "created",
      actor: created.createdBy,
      summary: `Uploaded version ${created.versionNumber} of ${created.itemType} "${created.itemTitle}"`,
      projectCode: created.projectCode,
    });
    res.status(HTTP.CREATED).json(formatSuccess(created, "Revision created"));
  } catch (err) {
    next(err);
  }
};

export const setStatus = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const updated = await service.setStatus(parseIdParam(req.params.id, "id"), req.body.status, req.body.comment, actorOf(req));
    await logAudit({
      entityType: "revision",
      entityId: String(updated.id),
      action: updated.status.toLowerCase().replace(/\s+/g, "-"),
      actor: req.authUser?.name ?? "unknown",
      summary: `Revision ${updated.versionNumber} of "${updated.itemTitle}" set to ${updated.status}`,
      projectCode: updated.projectCode,
    });
    res.json(formatSuccess(updated, "Revision status updated"));
  } catch (err) {
    next(err);
  }
};

export const download = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const { file, revision } = await service.openFile(parseIdParam(req.params.id, "id"), actorOf(req));
    res.setHeader("Content-Type", file.contentType);
    if (file.sizeBytes != null) res.setHeader("Content-Length", String(file.sizeBytes));
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(revision.fileName)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    await pipeline(file.stream, res);
  } catch (err) {
    next(err);
  }
};
