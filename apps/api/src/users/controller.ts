import { NextFunction, Request, Response } from "express";
import { HTTP } from "../constants/http-status.js";
import { AuthedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";
import { formatSuccess } from "../utils/response.js";
import * as service from "./service.js";
import type { UserFilters } from "./types.js";
import { parsePageRequest, sendPaged } from "../utils/pagination.js";
import { USER_SORT_COLUMNS } from "./repository.js";
import { parseIdParam } from "../utils/params.js";

export const getAll = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filters: UserFilters = { role: req.query.role as string };
    const paging = parsePageRequest(req.query, { sortable: Object.keys(USER_SORT_COLUMNS), defaultOrder: "asc" });
    if (paging.requested) {
      const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim() : undefined;
      const { items, meta } = await service.getPage({ ...filters, search }, paging);
      sendPaged(res, items, "Users retrieved", meta);
      return;
    }
    const data = await service.getAll(filters);
    res.json(formatSuccess(data, "Users retrieved"));
  } catch (err) {
    next(err);
  }
};

export const create = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.create(req.body);
    await logAudit({
      entityType: "user",
      entityId: String(data.id),
      action: "created",
      actor: req.authUser?.name ?? "unknown",
      summary: `Created account ${data.email} with role ${data.role}`,
    });
    res.status(HTTP.CREATED).json(formatSuccess(data, "User created"));
  } catch (err) {
    next(err);
  }
};

export const update = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.update(parseIdParam(req.params.id, "id"), req.body);
    await logAudit({
      entityType: "user",
      entityId: String(req.params.id),
      action: "updated",
      actor: req.authUser?.name ?? "unknown",
      summary: `Updated account ${data.email} (role ${data.role})`,
    });
    res.json(formatSuccess(data, "User updated"));
  } catch (err) {
    next(err);
  }
};

export const setStatus = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { isActive } = req.body as { isActive: boolean };
    const data = await service.setActive(
      parseIdParam(req.params.id, "id"),
      isActive,
      req.authUser!.id,
    );
    await logAudit({
      entityType: "user",
      entityId: String(req.params.id),
      action: "updated",
      actor: req.authUser?.name ?? "unknown",
      summary: `${isActive ? "Reactivated" : "Deactivated"} account ${data.email}`,
    });
    res.json(
      formatSuccess(data, isActive ? "User reactivated" : "User deactivated"),
    );
  } catch (err) {
    next(err);
  }
};

export const setPassword = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { password } = req.body as { password: string };
    const data = await service.setPassword(parseIdParam(req.params.id, "id"), password);
    await logAudit({
      entityType: "user",
      entityId: String(req.params.id),
      action: "updated",
      // The password itself is never logged — only that it was reset, by whom.
      actor: req.authUser?.name ?? "unknown",
      summary: `Reset the password on account ${data.email}`,
    });
    res.json(formatSuccess(data, "Password updated"));
  } catch (err) {
    next(err);
  }
};

export const remove = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.remove(
      parseIdParam(req.params.id, "id"),
      req.authUser!.id,
    );
    await logAudit({
      entityType: "user",
      entityId: String(req.params.id),
      action: "deleted",
      actor: req.authUser?.name ?? "unknown",
      summary: `Permanently deleted account ${data.email}`,
    });
    res.json(formatSuccess(data, "User deleted"));
  } catch (err) {
    next(err);
  }
};
