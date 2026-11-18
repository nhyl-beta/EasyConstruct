// Real-database test (npm run test:db): an account's name must be the name of an employee in the database.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { users } from "../../../core/db/schema/users.js";
import { employees } from "../../../core/db/schema/employees.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import { update } from "./service.js";

const tag = `an${Date.now().toString(36)}`;
const IT = { id: 0, name: "IT Test", role: "it-designer" } as Parameters<typeof update>[2];
let userId: number;
let employeeId: number;
const employeeName = `Real Person ${tag}`;

describe("renaming an unlinked account", () => {
  before(async () => {
    assertDemoDatabase();
    userId = (await db.insert(users).values({ name: "Old Name", email: `${tag}@example.test`, password: "x", role: "engineer" }).returning({ id: users.id }))[0]!.id;
    employeeId = (
      await db
        .insert(employees)
        .values({ employeeId: `N-${tag}`.slice(0, 20), name: employeeName, initials: "RP", role: "Tester", department: "QA", site: "HQ", hiredOn: "2026-01-01", email: `emp.${tag}@example.test` })
        .returning({ id: employees.id })
    )[0]!.id;
  });

  after(async () => {
    await db.delete(employees).where(eq(employees.id, employeeId));
    await db.delete(users).where(eq(users.id, userId));
  });

  test("a name that is not an employee is refused and nothing changes", async () => {
    await assert.rejects(() => update(userId, { name: "Nobody Here", email: `${tag}@example.test`, role: "engineer" }, IT), /not an employee/);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    assert.equal(u!.name, "Old Name");
  });

  test("an employee's name is accepted, whatever its case and spacing", async () => {
    await update(userId, { name: `  ${employeeName.toUpperCase()} `, email: `${tag}@example.test`, role: "engineer" }, IT);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    assert.ok(u!.name.toLowerCase().includes(employeeName.toLowerCase()));
  });
});
