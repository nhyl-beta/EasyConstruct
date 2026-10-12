// server/src/reference/routes.ts (objectives fix 1.2), mounted at /api/reference
import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { HTTP } from "../constants/http-status.js";
import { authenticate, requireRole, type AuthedRequest } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { formatSuccess } from "../utils/response.js";
import { logAudit } from "../utils/audit.js";
import { byString, respondList } from "../utils/pagination.js";
import * as service from "./service.js";

const router = Router();
router.use(authenticate);

const createSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(255),
  confirmSimilar: z.boolean().optional(),
});

const mount = (kind: service.ReferenceKind, writers: string[]) => {
  router.get(`/${kind}`, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const rows = await service.list(kind, search);
      respondList(res, req.query, rows, `${kind} retrieved`, {
        name: byString((r: (typeof rows)[number]) => r.name),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(`/${kind}`, requireRole(...writers), validate(createSchema), async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const actor = { name: req.authUser?.name ?? "unknown" };
      const created = await service.create(kind, req.body, actor);
      await logAudit({
        entityType: kind === "clients" ? "client" : "vendor",
        entityId: String(created.id),
        action: "created",
        actor: actor.name,
        summary: `Added ${kind === "clients" ? "client" : "vendor"} "${created.name}"`,
      });
      res.status(HTTP.CREATED).json(formatSuccess(created, `${kind === "clients" ? "Client" : "Vendor"} added`));
    } catch (err) {
      next(err);
    }
  });
};

// Anyone signed in can read the lists (they fill dropdowns); only the roles that
// create projects, or buy things, can add to them.
mount("clients", ["project-manager", "admin", "it-designer"]);
mount("vendors", ["finance-manager", "engineer", "project-manager", "admin"]);

export default router;
