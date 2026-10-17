import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { FLAGGED_CLOCK_IN_ROLES, buildFlaggedAlert, flaggedClockInLink, formatDistance, shouldAlertFlagged, type SavedClockIn } from "./alert.js";

const record = (over: Partial<SavedClockIn> = {}): SavedClockIn => ({
  id: 42,
  status: "Flagged",
  geofence: "Outside",
  employeeId: "EMP-1",
  projectCode: "P4",
  logDate: "2026-10-17",
  clockIn: "08:05",
  distanceFromSiteM: 1250,
  validatedOffline: false,
  ...over,
});

describe("who is told and when", () => {
  test("the PM, HR and Admin", () => {
    assert.deepEqual([...FLAGGED_CLOCK_IN_ROLES], ["project-manager", "human-resources", "admin"]);
  });

  test("only a measured breach alerts", () => {
    assert.equal(shouldAlertFlagged({ status: "Flagged", geofence: "Outside" }), true);
    assert.equal(shouldAlertFlagged({ status: "Verified", geofence: "Inside" }), false);
    assert.equal(shouldAlertFlagged({ status: "Pending", geofence: "Unverified" }), false);
  });
});

describe("the alert text", () => {
  test("names the person, project, distance from site and time", () => {
    const a = buildFlaggedAlert({ record: record(), employeeName: "Rico Domingo", projectName: "Pasig Retail", radiusM: 300 });
    assert.match(a.title, /Rico Domingo/);
    assert.match(a.body, /08:05/);
    assert.match(a.body, /2026-10-17/);
    assert.match(a.body, /Pasig Retail \(P4\)/);
    assert.match(a.body, /1\.3 km from the site \(allowed 300 m\)/);
  });

  test("an offline-synced clock-in says so", () => {
    const a = buildFlaggedAlert({ record: record({ validatedOffline: true }), employeeName: "Rico", projectName: "P", radiusM: 300 });
    assert.match(a.body, /recorded offline, synced later/);
  });

  test("links to the attendance record, highlighted", () => {
    assert.equal(flaggedClockInLink(42), "/attendance?highlight=42");
    assert.equal(buildFlaggedAlert({ record: record(), employeeName: "R", projectName: "P", radiusM: 300 }).link, "/attendance?highlight=42");
  });

  test("distances read as metres below a kilometre", () => {
    assert.equal(formatDistance(450), "450 m");
    assert.equal(formatDistance(1000), "1.0 km");
    assert.equal(formatDistance(null), "an unknown distance");
  });
});
