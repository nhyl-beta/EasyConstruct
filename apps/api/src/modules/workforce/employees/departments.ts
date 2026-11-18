// HR-managed department list: everyone who can read employees sees it; HR adds and removes.
import type { NextFunction, Response } from "express";
import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";

import type { AuthedRequest } from "../../../core/auth/middleware.js";
import { db } from "../../../core/db/connection.js";
import { departments, employees } from "../../../core/db/schema/employees.js";
import { logAudit } from "../../../core/audit/audit.js";
import { HTTP } from "../../../core/config/http-status.js";
import { ConflictError, NotFoundError } from "../../../core/utils/errors.js";
import { parseIdParam } from "../../../core/utils/params.js";
import { formatSuccess } from "../../../core/utils/response.js";

export const createDepartmentSchema = z.object({ name: z.string().trim().min(2, "Enter a name").max(100) });

const keyOf = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export const list = async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await db.select().from(departments).orderBy(asc(departments.name));
    res.json(formatSuccess(rows, "Departments retrieved"));
  } catch (err) {
    next(err);
  }
};

export const create = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const name = String(req.body.name).trim().replace(/\s+/g, " ");
    const [row] = await db.insert(departments).values({ name, nameKey: keyOf(name) }).onConflictDoNothing().returning();
    if (!row) throw new ConflictError(`Department "${name}" already exists`);
    await logAudit({ entityType: "department", entityId: String(row.id), action: "created", actor: req.authUser?.name ?? "unknown", summary: `Added department "${name}"` });
    res.status(HTTP.CREATED).json(formatSuccess(row, "Department added"));
  } catch (err) {
    next(err);
  }
};

export const remove = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const id = parseIdParam(req.params.id, "id");
    const [row] = await db.select().from(departments).where(eq(departments.id, id));
    if (!row) throw new NotFoundError("Department", String(id));
    const [used] = await db.select({ n: sql<number>`count(*)::int` }).from(employees).where(sql`lower(trim(${employees.department})) = ${row.nameKey}`);
    if ((used?.n ?? 0) > 0) throw new ConflictError(`${used!.n} employee(s) are still in "${row.name}". Move them to another department first.`);
    await db.delete(departments).where(eq(departments.id, id));
    await logAudit({ entityType: "department", entityId: String(id), action: "deleted", actor: req.authUser?.name ?? "unknown", summary: `Removed department "${row.name}"` });
    res.json(formatSuccess({ id }, "Department removed"));
  } catch (err) {
    next(err);
  }
};
