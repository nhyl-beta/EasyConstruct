import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { inRange, milestoneAttention, parseRange, sameName, submissionAttention, visibleProjects } from "./events.js";

const projects = [
  { code: "P-1", pmUserId: 10 },
  { code: "P-2", pmUserId: 11 },
  { code: "P-3", pmUserId: null },
];

describe("visibleProjects (scoping is unchanged by the date window)", () => {
  test("a project member sees only their memberships", () => {
    const r = visibleProjects({ id: 5, role: "engineer" }, projects, true, new Set(["P-3"]));
    assert.deepEqual(r.map((p) => p.code), ["P-3"]);
  });
  test("a member with no memberships sees nothing", () => {
    assert.deepEqual(visibleProjects({ id: 5, role: "site-personnel" }, projects, true, new Set()), []);
  });
  test("a project manager sees only the projects they manage", () => {
    assert.deepEqual(visibleProjects({ id: 10, role: "project-manager" }, projects, false, new Set()).map((p) => p.code), ["P-1"]);
  });
  test("owner and other non-staffed roles see every project", () => {
    assert.equal(visibleProjects({ id: 1, role: "owner" }, projects, false, new Set()).length, 3);
  });
});

describe("date window", () => {
  test("no window means everything", () => {
    assert.equal(parseRange(undefined, undefined), null);
    assert.equal(inRange("2020-01-01", null), true);
  });
  test("inclusive bounds", () => {
    const r = parseRange("2026-10-01", "2026-10-31");
    assert.equal(inRange("2026-10-01", r), true);
    assert.equal(inRange("2026-10-31", r), true);
    assert.equal(inRange("2026-09-30", r), false);
    assert.equal(inRange("2026-11-01", r), false);
  });
  test("rejects half a window, bad dates, reversed and oversized windows", () => {
    assert.throws(() => parseRange("2026-10-01", undefined));
    assert.throws(() => parseRange("10/01/2026", "2026-10-31"));
    assert.throws(() => parseRange("2026-02-31x", "2026-03-01"));
    assert.throws(() => parseRange("2026-10-31", "2026-10-01"));
    assert.throws(() => parseRange("2025-01-01", "2026-12-31"));
  });
});

describe("attention flags", () => {
  test("a milestone past its date and not done is overdue", () => {
    assert.equal(milestoneAttention("active", "2026-10-01", "2026-10-12"), "overdue");
    assert.equal(milestoneAttention("draft", "2026-10-12", "2026-10-12"), undefined);
    assert.equal(milestoneAttention("completed", "2026-10-01", "2026-10-12"), undefined);
    assert.equal(milestoneAttention("cancelled", "2026-10-01", "2026-10-12"), undefined);
  });
  test("only in-flight submissions are waiting", () => {
    assert.equal(submissionAttention("active"), "waiting");
    assert.equal(submissionAttention("completed"), undefined);
    assert.equal(submissionAttention("rejected"), undefined);
  });
  test("names match without regard to case or spacing", () => {
    assert.equal(sameName(" Ana Cruz ", "ana cruz"), true);
    assert.equal(sameName(null, "ana"), false);
  });
});
