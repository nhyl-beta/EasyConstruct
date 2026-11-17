// Real-database test (npm run test:db) for createManualAttendance — the
// in-app "log one worker's attendance with a photo" flow (QuickAttendanceEntry).
// Mirrors the checks the spreadsheet import already has: real roster lookup,
// the actor's own project staffing, and one record per worker per day.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";

import { db } from "../../../core/db/connection.js";
import { projects } from "../../../core/db/schema/projects.js";
import { users } from "../../../core/db/schema/users.js";
import { employees } from "../../../core/db/schema/employees.js";
import { projectMembers } from "../../../core/db/schema/project-members.js";
import { attendance } from "../../../core/db/schema/attendance.js";
import { assertDemoDatabase } from "../../../../scripts/demo/demo-guard.js";
import * as service from "./service.js";

const tag = `MAN${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;
const EMP = `ZZ-EMP-${tag}`;

let sitePersonnel: { id: number; name: string };

describe("createManualAttendance", () => {
  before(async () => {
    assertDemoDatabase();
    const [row] = await db.select().from(users).where(eq(users.role, "site-personnel")).limit(1);
    assert.ok(row, "a site-personnel user must exist");
    sitePersonnel = { id: row!.id, name: row!.name };

    await db.insert(projects).values({ name: "Manual attendance test", code: P, pm: "Test PM", due: "2099-12-31", status: "Construction" });
    await db.insert(employees).values({ employeeId: EMP, name: "Test Worker", initials: "TW", role: "Laborer", department: "Construction", site: "Test Site", hiredOn: "2026-01-01" });
    await db.insert(projectMembers).values({ projectCode: P, userId: sitePersonnel.id, userName: sitePersonnel.name, role: "site-personnel", addedBy: "test" });
  });

  after(async () => {
    await db.delete(attendance).where(eq(attendance.projectCode, P));
    await db.delete(projectMembers).where(eq(projectMembers.projectCode, P));
    await db.delete(employees).where(eq(employees.employeeId, EMP));
    await db.delete(projects).where(eq(projects.code, P));
  });

  test("logs a worker's attendance with a photo, Pending and Unverified", async () => {
    const logDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    const created = await service.createManualAttendance(
      { employeeId: EMP, projectCode: P, logDate, clockIn: "08:00", clockOut: "17:00", photoUrl: "/uploads/test-photo.jpg" },
      { role: "site-personnel", userId: sitePersonnel.id, name: sitePersonnel.name },
    );
    assert.ok(created, "the record must be created");
    assert.equal(created.employeeId, EMP);
    assert.equal(created.geofence, "Unverified");
    assert.equal(created.status, "Pending");
    assert.equal(created.source, "Manual");
    assert.equal(created.photoUrl, "/uploads/test-photo.jpg");
    assert.equal(created.hours, "9.0");
  });

  test("rejects a second entry for the same worker on the same day", async () => {
    const logDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    await assert.rejects(
      service.createManualAttendance(
        { employeeId: EMP, projectCode: P, logDate, clockIn: "08:00", photoUrl: "/uploads/test-photo-2.jpg" },
        { role: "site-personnel", userId: sitePersonnel.id, name: sitePersonnel.name },
      ),
      /already recorded/,
    );
  });

  test("rejects an unknown worker ID", async () => {
    const logDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    await assert.rejects(
      service.createManualAttendance(
        { employeeId: "NO-SUCH-WORKER", projectCode: P, logDate, clockIn: "08:00", photoUrl: "/uploads/x.jpg" },
        { role: "site-personnel", userId: sitePersonnel.id, name: sitePersonnel.name },
      ),
      /Worker/,
    );
  });

  test("rejects a site-personnel actor who isn't staffed on the project", async () => {
    // The same site-personnel user used throughout this file — staffed on P,
    // but never added to this second project, so the staffing check alone
    // (not "no such user") is what rejects it.
    const otherProject = `${P}-OTHER`;
    await db.insert(projects).values({ name: "Unstaffed project", code: otherProject, pm: "Test PM", due: "2099-12-31", status: "Construction" });
    try {
      await assert.rejects(
        service.createManualAttendance(
          { employeeId: EMP, projectCode: otherProject, logDate: "2026-06-01", clockIn: "08:00", photoUrl: "/uploads/x.jpg" },
          { role: "site-personnel", userId: sitePersonnel.id, name: sitePersonnel.name },
        ),
        /not staffed/,
      );
    } finally {
      await db.delete(projects).where(eq(projects.code, otherProject));
    }
  });
});
