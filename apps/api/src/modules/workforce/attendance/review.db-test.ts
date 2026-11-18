// HR verifying or flagging a clock-in marks it reviewed; flagging also tells the project's PM and Site Personnel.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { attendance } from "../../../core/db/schema/attendance.js";
import { employees } from "../../../core/db/schema/employees.js";
import { notifications as notificationsTable } from "../../../core/db/schema/notifications.js";
import { projects } from "../../../core/db/schema/projects.js";
import { users } from "../../../core/db/schema/users.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import * as service from "./service.js";

const tag = `ATR${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;
const EMP = `Z${Date.now() % 1e7}`;
let a: number, b: number;

before(async () => {
  assertDemoDatabase();
  const [pm] = await db.select().from(users).where(eq(users.role, "project-manager")).limit(1);
  await db.insert(projects).values({ name: "Review test", code: P, pm: pm!.name, pmUserId: pm!.id, due: "2099-12-31", status: "Construction" });
  await db.insert(employees).values({ employeeId: EMP, name: "Review Test", initials: "RT", role: "x", department: "Design", site: "s", hiredOn: "2026-01-01" });
  const rows = await db.insert(attendance).values([
    { employeeId: EMP, site: "s", projectCode: P, clockIn: "08:00", geofence: "Outside", status: "Flagged", logDate: "2026-11-17" },
    { employeeId: EMP, site: "s", projectCode: P, clockIn: "08:00", geofence: "Outside", status: "Flagged", logDate: "2026-11-18" },
  ]).returning();
  [a, b] = [rows[0]!.id, rows[1]!.id];
});

after(async () => {
  await db.delete(notificationsTable).where(eq(notificationsTable.projectCode, P));
  await db.delete(attendance).where(eq(attendance.projectCode, P));
  await db.delete(employees).where(eq(employees.employeeId, EMP));
  await db.delete(projects).where(eq(projects.code, P));
});

test("verifying marks the clock-in reviewed; flagging marks it reviewed and notifies with the note", async () => {
  assert.equal((await service.update(a, { status: "Verified" })).reviewedAt instanceof Date, true);
  const flagged = await service.update(b, { status: "Flagged", remarks: "Call the foreman" });
  assert.ok(flagged.reviewedAt);
  const sent = await db.select().from(notificationsTable).where(eq(notificationsTable.projectCode, P));
  assert.ok(sent.some((n) => n.title.includes("HR flagged") && (n.message ?? "").includes("Call the foreman")), "a notice with HR's note goes out");
});
