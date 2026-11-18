// Departments: seeded from employees, unique by name, and one with employees cannot be removed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../../../core/db/connection.js";
import { departments, employees } from "../../../core/db/schema/employees.js";
import * as handlers from "./departments.js";

const call = async (fn: (req: never, res: never, next: (e?: unknown) => void) => Promise<void>, req: object) => {
  let status = 200;
  let error: unknown;
  await fn({ authUser: { name: "t" }, params: {}, body: {}, ...req } as never, { status: (c: number) => ({ json: () => void (status = c) }), json: () => undefined } as never, (e) => void (error = e));
  return { status, error: error as { statusCode?: number; status?: number } | undefined };
};

test("add is unique by name, remove is refused while employees use it", async () => {
  const name = `Zz Dept ${Date.now()}`;
  assert.equal((await call(handlers.create, { body: { name } })).status, 201);
  assert.ok((await call(handlers.create, { body: { name: name.toUpperCase() } })).error, "same name in other case is a conflict");
  const [row] = await db.select().from(departments).where(eq(departments.nameKey, name.toLowerCase()));
  const [emp] = await db.insert(employees).values({ employeeId: `Z${Date.now() % 1e7}`, name: "Dept Test", initials: "DT", role: "x", department: name, site: "s", hiredOn: "2026-01-01" }).returning();
  assert.ok((await call(handlers.remove, { params: { id: String(row!.id) } })).error, "refused while in use");
  await db.delete(employees).where(eq(employees.id, emp!.id));
  assert.equal((await call(handlers.remove, { params: { id: String(row!.id) } })).error, undefined);
});
