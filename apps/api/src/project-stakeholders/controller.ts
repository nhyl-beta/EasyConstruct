// apps/api/src/project-stakeholders/controller.ts (client demo change #4)
import { NextFunction, Response } from "express";
import { HTTP } from "../core/config/http-status.js";
import type { AuthedRequest } from "../core/auth/middleware.js";
import { UnauthorizedError } from "../core/utils/errors.js";
import { logAudit } from "../core/audit/audit.js";
import { byString, respondList } from "../core/utils/pagination.js";
import { parseIdParam } from "../core/utils/params.js";
import { formatSuccess } from "../core/utils/response.js";
import { diffFields, formatChanges } from "../core/utils/diff-fields.js";
import * as service from "./service.js";
import type { VisibleStakeholder } from "./rules.js";

const actorOf = (req: AuthedRequest): service.Actor => {
  const u = req.authUser;
  if (!u) throw new UnauthorizedError("Not signed in");
  return { id: u.id, name: u.name, role: u.role };
};

type Handler = (req: AuthedRequest, res: Response) => Promise<void>;
const wrap = (fn: Handler) => async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

export const list = wrap(async (req, res) => {
  const projectCode = typeof req.query.projectCode === "string" ? req.query.projectCode : "";
  const rows = await service.list(projectCode, actorOf(req));
  respondList(res, req.query, rows, "Stakeholders retrieved", {
    name: byString((r: VisibleStakeholder) => r.name),
    company: byString((r: VisibleStakeholder) => r.company ?? ""),
    role: byString((r: VisibleStakeholder) => r.role),
  });
});

export const create = wrap(async (req, res) => {
  const { projectCode, ...input } = req.body;
  const created = await service.create(projectCode, input, actorOf(req));
  await logAudit({
    entityType: "stakeholder",
    entityId: String(created.id),
    action: "created",
    actor: req.authUser!.name,
    summary: `Added ${created.role} "${created.name}"${created.company ? ` (${created.company})` : ""} to project ${projectCode}`,
    projectCode,
  });
  res.status(HTTP.CREATED).json(formatSuccess(created, "Stakeholder added"));
});

export const update = wrap(async (req, res) => {
  const { before, after } = await service.update(parseIdParam(req.params.id, "id"), req.body, actorOf(req));
  // Contact details are logged as "changed", never with their values.
  const prior = before as unknown as Record<string, unknown>;
  const changes = diffFields(prior, req.body as Record<string, unknown>, { ignore: ["email", "phone"] });
  const contactChanged = ["email", "phone"].filter((k) => k in req.body && String(req.body[k] ?? "") !== String(prior[k] ?? ""));
  await logAudit({
    entityType: "stakeholder",
    entityId: String(after.id),
    action: "updated",
    actor: req.authUser!.name,
    summary: `Edited stakeholder "${before.name}" on ${before.projectCode}: ${[formatChanges(changes), ...contactChanged.map((k) => `${k} changed`)].filter(Boolean).join("; ") || "no change"}`,
    projectCode: before.projectCode,
  });
  res.json(formatSuccess(after, "Stakeholder updated"));
});

export const remove = wrap(async (req, res) => {
  const removed = await service.remove(parseIdParam(req.params.id, "id"), actorOf(req));
  await logAudit({
    entityType: "stakeholder",
    entityId: String(removed.id),
    action: "deleted",
    actor: req.authUser!.name,
    summary: `Removed ${removed.role} "${removed.name}" from project ${removed.projectCode}`,
    projectCode: removed.projectCode,
  });
  res.json(formatSuccess({ id: removed.id }, "Stakeholder removed"));
});
