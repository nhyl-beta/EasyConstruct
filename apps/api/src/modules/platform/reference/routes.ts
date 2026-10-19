// apps/api/src/reference/routes.ts (objectives fix 1.2), mounted at /api/reference
import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { HTTP } from "../../../core/config/http-status.js";
import { authenticate, requireRole, type AuthedRequest } from "../../../core/auth/middleware.js";
import { validate } from "../../../core/http/validate.js";
import { formatSuccess } from "../../../core/utils/response.js";
import { logAudit } from "../../../core/audit/audit.js";
import { byString, respondList } from "../../../core/utils/pagination.js";
import * as service from "./service.js";
import { documentTypes } from "../../documents/index.js";
import { parseIdParam } from "../../../core/utils/params.js";

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

// -- Document types (client demo change #1) -------------------------------
// Everyone signed in reads the active types (they fill the upload dialogs); Admin and IT Designer
// add, rename, regroup and deactivate. `?all=1` (writers only) includes the inactive ones.
const DOCUMENT_TYPE_WRITERS = ["admin", "it-designer"];

const documentTypeCreateSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(50, "At most 50 characters"),
  category: z.string().trim().max(50).optional(),
});

const documentTypeUpdateSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(50, "At most 50 characters").optional(),
  category: z.string().trim().min(1).max(50).optional(),
  active: z.boolean().optional(),
});

router.get("/document-types", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const isWriter = DOCUMENT_TYPE_WRITERS.includes(req.authUser?.role ?? "");
    const rows = await documentTypes.list(isWriter && req.query.all === "1");
    respondList(res, req.query, rows, "Document types retrieved", {
      name: byString((r: (typeof rows)[number]) => r.name),
      category: byString((r: (typeof rows)[number]) => r.category),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/document-types", requireRole(...DOCUMENT_TYPE_WRITERS), validate(documentTypeCreateSchema), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = { name: req.authUser?.name ?? "unknown" };
    const created = await documentTypes.create(req.body, actor);
    await logAudit({
      entityType: "document_type",
      entityId: String(created.id),
      action: "created",
      actor: actor.name,
      summary: `Added document type "${created.name}" (${created.category})`,
    });
    res.status(HTTP.CREATED).json(formatSuccess(created, "Document type added"));
  } catch (err) {
    next(err);
  }
});

router.patch("/document-types/:id", requireRole(...DOCUMENT_TYPE_WRITERS), validate(documentTypeUpdateSchema), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.authUser?.name ?? "unknown";
    const { before, after } = await documentTypes.update(parseIdParam(req.params.id, "id"), req.body);
    const changes: string[] = [];
    if (before.name !== after.name) changes.push(`name "${before.name}" -> "${after.name}"`);
    if (before.category !== after.category) changes.push(`category "${before.category}" -> "${after.category}"`);
    if (before.active !== after.active) changes.push(after.active ? "reactivated" : "deactivated");
    await logAudit({
      entityType: "document_type",
      entityId: String(after.id),
      action: "updated",
      actor,
      summary: `Document type "${before.name}": ${changes.join(", ") || "no change"}`,
    });
    res.json(formatSuccess(after, "Document type updated"));
  } catch (err) {
    next(err);
  }
});

export default router;
