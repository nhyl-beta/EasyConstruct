import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocateTasks,
  assessAssignment,
  countOverlapping,
  positionFit,
  rankAssignees,
  type AllocationCandidate,
} from "./suggest.js";

const cand = (over: Partial<AllocationCandidate> & { userId: number }): AllocationCandidate => ({
  name: `User ${over.userId}`,
  employeeId: `E-${over.userId}`,
  position: "Laborer",
  employeeStatus: "Active",
  openTasks: [],
  attendanceDays: 10,
  onLeaveToday: false,
  absentToday: false,
  ...over,
});

test("fewer open tasks ranks higher", () => {
  const r = rankAssignees(
    [cand({ userId: 1, openTasks: [{ dueDate: null }, { dueDate: null }] }), cand({ userId: 2, openTasks: [] })],
    { title: "Clean site" },
  );
  assert.deepEqual(r.ranked.map((c) => c.userId), [2, 1]);
});

test("a task due near the target date counts against the candidate", () => {
  const r = rankAssignees(
    [cand({ userId: 1, openTasks: [{ dueDate: "2026-11-10" }] }), cand({ userId: 2, openTasks: [{ dueDate: "2026-12-30" }] })],
    { title: "Pour slab", dueDate: "2026-11-11" },
  );
  assert.equal(r.ranked[0]!.userId, 2);
  assert.match(r.ranked[1]!.reasons.join("|"), /due within 3 days/);
});

test("more attendance days ranks higher, capped", () => {
  const r = rankAssignees([cand({ userId: 1, attendanceDays: 3 }), cand({ userId: 2, attendanceDays: 14 })], { title: "x1" });
  assert.equal(r.ranked[0]!.userId, 2);
  const capped = rankAssignees([cand({ userId: 1, attendanceDays: 10 }), cand({ userId: 2, attendanceDays: 14 })], { title: "x1" });
  // equal after the cap -> lowest id wins
  assert.equal(capped.ranked[0]!.userId, 1);
});

test("position match is a bonus", () => {
  const r = rankAssignees(
    [cand({ userId: 1, position: "Laborer" }), cand({ userId: 2, position: "Electrician" })],
    { title: "Install conduit and wiring" },
  );
  assert.equal(r.ranked[0]!.userId, 2);
  assert.ok(r.ranked[0]!.reasons.some((x) => x.includes("fits")));
});

test("ties break by user id", () => {
  const r = rankAssignees([cand({ userId: 9 }), cand({ userId: 3 }), cand({ userId: 5 })], { title: "x1" });
  assert.deepEqual(r.ranked.map((c) => c.userId), [3, 5, 9]);
});

test("excludes inactive, on leave and absent; returns top three", () => {
  const r = rankAssignees(
    [
      cand({ userId: 1, employeeStatus: "On Leave" }),
      cand({ userId: 2, absentToday: true }),
      cand({ userId: 3, onLeaveToday: true }),
      cand({ userId: 4 }),
      cand({ userId: 5 }),
      cand({ userId: 6 }),
      cand({ userId: 7 }),
    ],
    { title: "x1" },
  );
  assert.equal(r.ranked.length, 3);
  assert.deepEqual(r.excluded.map((e) => e.userId).sort(), [1, 2, 3]);
});

test("empty candidate list gives an empty result", () => {
  const r = rankAssignees([], { title: "x1" });
  assert.deepEqual(r.ranked, []);
  assert.deepEqual(r.excluded, []);
});

test("countOverlapping handles missing dates", () => {
  assert.equal(countOverlapping([{ dueDate: null }], "2026-11-01"), 0);
  assert.equal(countOverlapping([{ dueDate: "2026-11-01" }], null), 0);
  assert.equal(countOverlapping([{ dueDate: "2026-11-04" }], "2026-11-01"), 1);
  assert.equal(countOverlapping([{ dueDate: "2026-11-05" }], "2026-11-01"), 0);
});

test("positionFit", () => {
  assert.equal(positionFit("Mason", "Pour foundation slab"), "mason");
  assert.equal(positionFit("Mason", "Install wiring"), null);
  assert.equal(positionFit(null, "Pour slab"), null);
});

test("allocateTasks spreads a batch instead of piling on one person", () => {
  const out = allocateTasks(
    [cand({ userId: 1 }), cand({ userId: 2 })],
    [
      { id: 10, title: "a1", dueDate: null },
      { id: 11, title: "b1", dueDate: null },
    ],
  );
  assert.equal(out[0]!.suggestions[0]!.userId, 1);
  assert.equal(out[1]!.suggestions[0]!.userId, 2);
});

test("assessAssignment warns, never throws", () => {
  const w = assessAssignment(
    cand({ userId: 1, openTasks: Array.from({ length: 5 }, () => ({ dueDate: "2026-11-02" })), absentToday: true }),
    "2026-11-01",
  );
  assert.deepEqual(w.map((x) => x.code).sort(), ["absent_today", "over_limit", "overlap"]);
  assert.deepEqual(assessAssignment(cand({ userId: 2 }), "2026-11-01"), []);
});
