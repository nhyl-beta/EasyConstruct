// apps/api/src/deliverables/routes.ts — mounted at /api/deliverables
import { NextFunction, Response, Router } from "express";
import { z } from "zod";
import { authenticate, requireRole, type AuthedRequest } from "../../../core/auth/middleware.js";
import { validate } from "../../../core/http/validate.js";
import { DELIVERABLE_DISCIPLINES, DELIVERABLE_STATUSES } from "../../projects/index.js";
import { formatSuccess } from "../../../core/utils/response.js";
import { HTTP } from "../../../core/config/http-status.js";
import { UnauthorizedError } from "../../../core/utils/errors.js";
import * as service from "./service.js";
import { parseIdParam } from "../../../core/utils/params.js";

const router = Router();
router.use(authenticate);

const actorOf = (req: AuthedRequest): service.Actor => {
  const u = req.authUser;
  if (!u) throw new UnauthorizedError("Not signed in");
  return { id: u.id, name: u.name, role: u.role };
};
const wrap = (fn: (req: AuthedRequest, res: Response) => Promise<void>) => async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (e) {
    next(e);
  }
};

const addSchema = z.object({ projectCode: z.string().min(1).max(50), discipline: z.enum(DELIVERABLE_DISCIPLINES) });
const updateSchema = z
  .object({
    sheetRange: z.string().max(100).nullable().optional(),
    leadUserId: z.number().int().positive().nullable().optional(),
    status: z.enum(DELIVERABLE_STATUSES).optional(),
  })
  .strict();

// Reads are project-scoped in the service.
router.get(
  "/",
  wrap(async (req, res) => {
    const projectCode = typeof req.query.projectCode === "string" ? req.query.projectCode : "";
    res.json(formatSuccess(await service.list(projectCode, actorOf(req)), "Plan sets retrieved"));
  }),
);
router.post(
  "/",
  requireRole("project-manager", "admin"),
  validate(addSchema),
  wrap(async (req, res) => {
    res.status(HTTP.CREATED).json(formatSuccess(await service.add(req.body, actorOf(req)), "Plan set added"));
  }),
);
router.patch(
  "/:id",
  requireRole("project-manager", "architect", "consultant", "admin"),
  validate(updateSchema),
  wrap(async (req, res) => {
    res.json(formatSuccess(await service.update(parseIdParam(req.params.id, "id"), req.body, actorOf(req)), "Plan set updated"));
  }),
);

export default router;
