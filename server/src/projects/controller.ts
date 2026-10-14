import { NextFunction, Response } from "express";
import { HTTP } from "../constants/http-status.js";
import { MSG } from "../constants/messages.js";
import { formatSuccess } from "../utils/response.js";
import type { AuthedRequest } from "../middleware/auth.js";
import * as service from "./service.js";
import type { ProjectFilters } from "./types.js";
import { parsePageRequest, sendPaged } from "../utils/pagination.js";
import { cached } from "../cache/index.js";
import { visibilityScope } from "../cache/scope.js";
import { PROJECT_SORT_COLUMNS } from "./repository.js";
import { parseIdParam } from "../utils/params.js";

const PROJECT_SORTABLE = Object.keys(PROJECT_SORT_COLUMNS);

const scopeOf = (req: AuthedRequest) =>
  req.authUser
    ? { role: req.authUser.role, userId: req.authUser.id, name: req.authUser.name }
    : undefined;

export const getAll = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const filters: ProjectFilters = {
      status: req.query.status as string,
      risk: req.query.risk as string,
      projectType: req.query.projectType as string,
      deliveryType: req.query.deliveryType as string,
      excludeArchived: req.query.excludeArchived === "1",
      search: req.query.search as string,
      code: typeof req.query.code === "string" && req.query.code ? req.query.code : undefined,
      kpis: req.query.kpis === "portfolio" || req.query.kpis === "filtered" ? req.query.kpis : undefined,
    };
    // Consultant is scoped to the projects it advises on, with commercial
    // fields stripped — see projects/service.ts getAll.
    const scope = scopeOf(req);
    // Server-side pagination is opt-in (page / limit, or the older pageSize);
    // every other caller keeps receiving the plain array.
    const paging = parsePageRequest(req.query, { sortable: PROJECT_SORTABLE });
    // 60 s, keyed by who may share the rows (a PM / staffed role sees its own
    // projects, everyone else the same set within their role) and by the exact query.
    const load = async () =>
      paging.requested
        ? await service.getPage(filters, scope, paging)
        : { items: await service.getAll(filters, scope), meta: undefined };
    const shared = visibilityScope(req.authUser);
    const result = shared
      ? await cached("projects", shared, 60, load, { query: req.query })
      : await load();
    if (result.meta) {
      sendPaged(res, result.items, MSG.projects.retrieved, result.meta);
      return;
    }
    res.json(formatSuccess(result.items, MSG.projects.retrieved));
  } catch (err) {
    next(err);
  }
};

export const getById = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Same membership scope as the list — otherwise a staff member who
    // cannot see a project in the table can still open it by guessing its id.
    const data = await service.getById(parseIdParam(req.params.id, "id"), scopeOf(req));
    res.json(formatSuccess(data, MSG.projects.single));
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
    // A Project Manager cannot assign a different PM on their own project —
    // the creator's own name is authoritative here regardless of what the
    // client sends. Admin/IT Designer retain the ability to assign any PM
    // (e.g. creating a project on behalf of the org).
    const body =
      req.authUser?.role === "project-manager"
        ? { ...req.body, pm: req.authUser.name }
        : req.body;
    const data = await service.create(
      body,
      req.authUser?.role === "project-manager" ? req.authUser.id : undefined,
    );
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.projects.created));
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
    const id = parseIdParam(req.params.id, "id");
    const data = await service.update(id, req.body, scopeOf(req));
    res.json(formatSuccess(data, MSG.projects.updated));
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
    const data = await service.remove(parseIdParam(req.params.id, "id"), scopeOf(req));
    res.json(formatSuccess(data, MSG.projects.deleted));
  } catch (err) {
    next(err);
  }
};
