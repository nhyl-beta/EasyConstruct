// B-111: files HR keeps on an employee (resume, CV, certificates...). The file is uploaded first (POST
// /uploads/...); these routes only store and list its link.
import { Router } from "express";
import type { NextFunction, Response } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";

import { requireRole, type AuthedRequest } from "../../../core/auth/middleware.js";
import { validate } from "../../../core/http/validate.js";
import { db } from "../../../core/db/connection.js";
import { employees } from "../../../core/db/schema/employees.js";
import { EMPLOYEE_DOCUMENT_TYPES, employeeDocuments } from "../../../core/db/schema/employee-documents.js";
import { logAudit } from "../../../core/audit/audit.js";
import { HTTP } from "../../../core/config/http-status.js";
import { NotFoundError } from "../../../core/utils/errors.js";
import { parseIdParam } from "../../../core/utils/params.js";
import { formatSuccess } from "../../../core/utils/response.js";

const createSchema = z.object({
  docType: z.enum(EMPLOYEE_DOCUMENT_TYPES).default("other"),
  name: z.string().trim().min(1).max(255),
  url: z.string().trim().min(1).max(2000),
});

// Mounted at /api/employees/:id/documents (the parent router authenticates). Personal files: HR writes, Admin reads.
const router = Router({ mergeParams: true });
router.use(requireRole("human-resources", "admin"));
const canWrite = requireRole("human-resources");

const requireEmployee = async (id: number) => {
  const [row] = await db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.id, id));
  if (!row) throw new NotFoundError("Employee", String(id));
  return row;
};

router.get("/", async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseIdParam(req.params.id, "id");
    await requireEmployee(id);
    const rows = await db.select().from(employeeDocuments).where(eq(employeeDocuments.employeeId, id)).orderBy(desc(employeeDocuments.createdAt), desc(employeeDocuments.id));
    res.json(formatSuccess(rows, "Employee documents retrieved"));
  } catch (err) {
    next(err);
  }
});

router.post("/", canWrite, validate(createSchema), async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseIdParam(req.params.id, "id");
    const employee = await requireEmployee(id);
    const actor = req.authUser!.name;
    const [created] = await db.insert(employeeDocuments).values({ ...req.body, employeeId: id, uploadedBy: actor }).returning();
    await logAudit({ entityType: "employee", entityId: String(id), action: "updated", actor, summary: `Added document "${created!.name}" to ${employee.name}` });
    res.status(HTTP.CREATED).json(formatSuccess(created, "Document added"));
  } catch (err) {
    next(err);
  }
});

router.delete("/:docId", canWrite, async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseIdParam(req.params.id, "id");
    const docId = parseIdParam(req.params.docId, "docId");
    const [removed] = await db.delete(employeeDocuments).where(and(eq(employeeDocuments.id, docId), eq(employeeDocuments.employeeId, id))).returning();
    if (!removed) throw new NotFoundError("Employee document", String(docId));
    await logAudit({ entityType: "employee", entityId: String(id), action: "updated", actor: req.authUser!.name, summary: `Removed document "${removed.name}"` });
    res.json(formatSuccess(removed, "Document removed"));
  } catch (err) {
    next(err);
  }
});

export default router;
