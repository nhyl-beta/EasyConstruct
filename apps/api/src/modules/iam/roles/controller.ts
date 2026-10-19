import { NextFunction, Request, Response } from "express";
import { MSG } from "../../../core/config/messages.js";
import { formatSuccess } from "../../../core/utils/response.js";
import * as service from "./service.js";
import { byString, respondList } from "../../../core/utils/pagination.js";
import { cached } from "../../../core/cache/index.js";
import { parseIdParam } from "../../../core/utils/params.js";

export const getAll = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Role configuration (not role resolution - permission checks never read this
    // cache). 5 min; role writes invalidate the `config` domain.
    const data = await cached("config", "all", 300, () => service.getAll());
    respondList(res, req.query, data, MSG.roles.retrieved, {
      name: byString((r) => r.name),
    });
  } catch (err) {
    next(err);
  }
};

export const getById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await service.getById(parseIdParam(req.params.id, "id"));
    res.json(formatSuccess(data, MSG.roles.single));
  } catch (err) {
    next(err);
  }
};

export const getAccountSummary = async (
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json(formatSuccess(await service.getAccountSummary(), "Role account summary retrieved"));
  } catch (err) {
    next(err);
  }
};
