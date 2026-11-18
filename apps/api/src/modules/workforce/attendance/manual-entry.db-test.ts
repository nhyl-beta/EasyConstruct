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
import * as payrollService from "../payroll/service.js";

const tag = `MAN${Date.now().toString(36)}`;
const P = `ZZ-${tag}`;
const EMP = `ZZ-EMP-${tag}`;

let sitePersonnel: { id: number; name: string };
let selfEmployeeId: string; // the Site Personnel's own employee record
let createdSelfEmployee = false;

describe("createManualAttendance", () => {
  before(async () => {
    assertDemoDatabase();
    const [row] = await db.select().from(users).where(eq(users.role, "site-personnel")).limit(1);
    assert.ok(row, "a site-personnel user must exist");
    sitePersonnel = { id: row!.id, name: row!.name };

    const [self] = await db.select().from(employees).where(eq(employees.userId, sitePersonnel.id)).limit(1);
    if (self) {
      selfEmployeeId = self.employeeId;
    } else {
      selfEmployeeId = `ZZ-SELF-${tag}`;
      await db.insert(employees).values({ employeeId: selfEmployeeId, name: sitePersonnel.name, initials: "SP", role: "Site Personnel", department: "Construction", site: "Test Site", hiredOn: "2026-01-01", userId: sitePersonnel.id });
      createdSelfEmployee = true;
    }

    await db.insert(projects).values({ name: "Manual attendance test", code: P, pm: "Test PM", due: "2099-12-31", status: "Construction" });
    await db.insert(employees).values({ employeeId: EMP, name: "Test Worker", initials: "TW", role: "Laborer", department: "Construction", site: "Test Site", hiredOn: "2026-01-01" });
    await db.insert(projectMembers).values({ projectCode: P, userId: sitePersonnel.id, userName: sitePersonnel.name, role: "site-personnel", addedBy: "test" });
  });

  after(async () => {
    await db.delete(attendance).where(eq(attendance.projectCode, P));
    await db.delete(projectMembers).where(eq(projectMembers.projectCode, P));
    await db.delete(employees).where(eq(employees.employeeId, EMP));
    if (createdSelfEmployee) await db.delete(employees).where(eq(employees.employeeId, selfEmployeeId));
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

  test("a verified entry with no time out earns no payroll hours until HR adds one", async () => {
    // Quick attendance entry's "Time out" is optional, so a Manual record can
    // reach HR with hours null — and HR's verify dialog can now fill in the
    // missing clock-out so the day isn't silently dropped from payroll.
    const logDate = "2026-06-10";
    const created = await service.createManualAttendance(
      { employeeId: EMP, projectCode: P, logDate, clockIn: "08:00", photoUrl: "/uploads/no-timeout.jpg" },
      { role: "site-personnel", userId: sitePersonnel.id, name: sitePersonnel.name },
    );
    assert.ok(created, "the record must be created");
    assert.equal(created.hours, null);

    await service.update(created.id, { status: "Verified" });
    const beforeFix = await payrollService.getAttendanceSummary(P, logDate, logDate);
    assert.equal(beforeFix.find((e) => e.employeeId === EMP), undefined, "zero hours must not appear in payroll yet");

    await service.update(created.id, { clockOut: "16:00" });
    const afterFix = await payrollService.getAttendanceSummary(P, logDate, logDate);
    const entry = afterFix.find((e) => e.employeeId === EMP);
    assert.ok(entry, "the day must now count toward payroll");
    assert.equal(entry!.hoursWorked, 8);
    assert.equal(entry!.overtimeHours, 0);
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

  // The Site Personnel's own attendance for a day on a project, as a clock-in would have saved it.
  const ownAttendance = (projectCode: string, logDate: string, status: string) =>
    db.insert(attendance).values({ employeeId: selfEmployeeId, site: "Test Site", projectCode, clockIn: "07:30", logDate, geofence: status === "Verified" ? "Inside" : "Unverified", status });

  test("computes geofence from the site personnel's own coordinates, not the worker's", async () => {
    // A project with a registered site: Inside within the radius, Outside past it —
    // same haversine check createAttendance (live clock-in) already uses.
    const geoProject = `${P}-GEO`;
    await db.insert(projects).values({
      name: "Manual attendance geofence test",
      code: geoProject,
      pm: "Test PM",
      due: "2099-12-31",
      status: "Construction",
      siteLatitude: "14.5995",
      siteLongitude: "120.9842",
      geofenceRadiusM: 300,
    });
    await db.insert(projectMembers).values({
      projectCode: geoProject,
      userId: sitePersonnel.id,
      userName: sitePersonnel.name,
      role: "site-personnel",
      addedBy: "test",
    });
    try {
      await ownAttendance(geoProject, "2026-06-02", "Verified");
      const inside = await service.createManualAttendance(
        {
          employeeId: EMP,
          projectCode: geoProject,
          logDate: "2026-06-02",
          clockIn: "08:00",
          photoUrl: "/uploads/geo-inside.jpg",
          latitude: 14.5995,
          longitude: 120.9842,
        },
        { role: "site-personnel", userId: sitePersonnel.id, name: sitePersonnel.name },
      );
      assert.ok(inside, "the inside-radius record must be created");
      assert.equal(inside.geofence, "Inside");
      assert.equal(inside.status, "Pending");

      const outside = await service.createManualAttendance(
        {
          employeeId: EMP,
          projectCode: geoProject,
          logDate: "2026-06-03",
          clockIn: "08:00",
          photoUrl: "/uploads/geo-outside.jpg",
          latitude: 14.65,
          longitude: 121.05,
        },
        { role: "site-personnel", userId: sitePersonnel.id, name: sitePersonnel.name },
      );
      assert.ok(outside, "the outside-radius record must be created");
      assert.equal(outside.geofence, "Outside");
      assert.equal(outside.status, "Pending");
    } finally {
      await db.delete(attendance).where(eq(attendance.projectCode, geoProject));
      await db.delete(projectMembers).where(eq(projectMembers.projectCode, geoProject));
      await db.delete(projects).where(eq(projects.code, geoProject));
    }
  });

  test("a worker is not verified to the site when the Site Personnel's own attendance is not verified", async () => {
    const geoProject = `${P}-UNV`;
    await db.insert(projects).values({ name: "Unverified personnel test", code: geoProject, pm: "Test PM", due: "2099-12-31", status: "Construction", siteLatitude: "14.5995", siteLongitude: "120.9842", geofenceRadiusM: 300 });
    await db.insert(projectMembers).values({ projectCode: geoProject, userId: sitePersonnel.id, userName: sitePersonnel.name, role: "site-personnel", addedBy: "test" });
    const atSite = { latitude: 14.5995, longitude: 120.9842 }; // the device is inside the radius either way
    const actor = { role: "site-personnel", userId: sitePersonnel.id, name: sitePersonnel.name };
    try {
      // No attendance of their own that day.
      const none = await service.createManualAttendance({ employeeId: EMP, projectCode: geoProject, logDate: "2026-06-04", clockIn: "08:00", photoUrl: "/uploads/a.jpg", ...atSite }, actor);
      assert.equal(none!.geofence, "Unverified");
      assert.match(none!.remarks ?? "", /not counted/i);

      // Their own record exists but is only Pending (not verified).
      await ownAttendance(geoProject, "2026-06-05", "Pending");
      const pending = await service.createManualAttendance({ employeeId: EMP, projectCode: geoProject, logDate: "2026-06-05", clockIn: "08:00", photoUrl: "/uploads/b.jpg", ...atSite }, actor);
      assert.equal(pending!.geofence, "Unverified");

      // Verified, but on a different project: it does not vouch for this one.
      await ownAttendance(P, "2026-06-06", "Verified");
      const elsewhere = await service.createManualAttendance({ employeeId: EMP, projectCode: geoProject, logDate: "2026-06-06", clockIn: "08:00", photoUrl: "/uploads/c.jpg", ...atSite }, actor);
      assert.equal(elsewhere!.geofence, "Unverified");
    } finally {
      await db.delete(attendance).where(eq(attendance.projectCode, geoProject));
      await db.delete(projectMembers).where(eq(projectMembers.projectCode, geoProject));
      await db.delete(projects).where(eq(projects.code, geoProject));
    }
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
