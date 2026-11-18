// Real-database test (npm run test:db): a worker visiting several projects in one day (B-185).
// One record per employee, project and day; visits can't overlap; each one carries its own proof.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { users } from "../../../core/db/schema/users.js";
import { employees } from "../../../core/db/schema/employees.js";
import { projectMembers } from "../../../core/db/schema/project-members.js";
import { attendance } from "../../../core/db/schema/attendance.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import * as service from "./service.js";

const tag = `VIS${Date.now().toString(36)}`;
const A = `ZZ-${tag}-A`;
const B = `ZZ-${tag}-B`;
const SITE_A = { lat: 14.5995, lng: 120.9842 };
const SITE_B = { lat: 14.7, lng: 121.05 }; // kilometres from A
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

let sp: { id: number; name: string };
let empId: string;
let createdEmployee = false;
let visitA: number;

const clockIn = (projectCode: string, at: { lat: number; lng: number }) =>
  service.create(
    { employeeId: empId, site: "Test Site", projectCode, clockIn: "07:00", logDate: today, latitude: at.lat, longitude: at.lng, photoUrl: "/uploads/v.jpg" },
    { role: "site-personnel", userId: sp.id },
  );

describe("attendance visits across projects", () => {
  before(async () => {
    assertDemoDatabase();
    const [row] = await db.select().from(users).where(eq(users.role, "site-personnel")).limit(1);
    assert.ok(row, "a site-personnel user must exist");
    sp = { id: row!.id, name: row!.name };
    const [own] = await db.select().from(employees).where(eq(employees.userId, sp.id)).limit(1);
    if (own) empId = own.employeeId;
    else {
      empId = `ZZ-VIS-${tag}`;
      await db.insert(employees).values({ employeeId: empId, name: sp.name, initials: "SP", role: "Site Personnel", department: "Construction", site: "Test Site", hiredOn: "2026-01-01", userId: sp.id });
      createdEmployee = true;
    }
    // Start from a clean day for this person so earlier demo data can't interfere.
    await db.delete(attendance).where(eq(attendance.employeeId, empId));
    for (const [code, at] of [[A, SITE_A], [B, SITE_B]] as const) {
      await db.insert(projects).values({ name: `Visits ${code}`, code, pm: "Test PM", due: "2099-12-31", status: "Construction", siteLatitude: String(at.lat), siteLongitude: String(at.lng), geofenceRadiusM: 300 });
      await db.insert(projectMembers).values({ projectCode: code, userId: sp.id, userName: sp.name, role: "site-personnel", addedBy: "test" });
    }
  });

  after(async () => {
    await db.delete(attendance).where(inArray(attendance.projectCode, [A, B]));
    await db.delete(projectMembers).where(inArray(projectMembers.projectCode, [A, B]));
    if (createdEmployee) await db.delete(employees).where(eq(employees.employeeId, empId));
    await db.delete(projects).where(inArray(projects.code, [A, B]));
  });

  test("clock-in at the first site is measured against that site", async () => {
    const created = await clockIn(A, SITE_A);
    assert.equal(created!.geofence, "Inside");
    visitA = created!.id;
  });

  test("a second site is refused while the first visit is still open", async () => {
    await assert.rejects(clockIn(B, SITE_B), /Clock out of .* before clocking in/);
  });

  test("clock-out records where he left from", async () => {
    const out = await service.update(visitA, { clockOut: "11:00", clockOutLatitude: SITE_A.lat, clockOutLongitude: SITE_A.lng });
    assert.equal(out.clockOutGeofence, "Inside");
  });

  test("after clocking out, the next project is measured against its own site", async () => {
    const second = await clockIn(B, SITE_B);
    assert.equal(second!.geofence, "Inside", "Site B's coordinates, not Site A's");
    const rows = await db.select().from(attendance).where(eq(attendance.employeeId, empId));
    assert.equal(rows.filter((r) => r.logDate === today).length, 2, "two visits on one day");
  });

  test("the same project twice in one day is still a duplicate", async () => {
    await assert.rejects(clockIn(A, SITE_A), /already been recorded today/);
  });

  test("clocking out away from the site is recorded as Outside", async () => {
    const [open] = await db.select().from(attendance).where(eq(attendance.projectCode, B));
    const out = await service.update(open!.id, { clockOut: "16:00", clockOutLatitude: SITE_A.lat, clockOutLongitude: SITE_A.lng });
    assert.equal(out.clockOutGeofence, "Outside");
  });
});
