import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { compareProjects, isArchivedStatus, sortProjects } from "./ordering.js";

const p = (id: number, status: string, updatedAt: string | null = "2026-10-01") => ({ id, status, updatedAt });

describe("project ordering", () => {
  test("archived projects always come after in-progress ones, however recently they changed", () => {
    const sorted = sortProjects([
      p(1, "Archived", "2026-10-02"),
      p(2, "Design", "2026-01-01"),
      p(3, "Construction", "2026-02-01"),
    ]);
    assert.deepEqual(sorted.map((r) => r.id), [3, 2, 1]);
  });

  test("order is live, Completed, Cancelled, Archived", () => {
    const sorted = sortProjects([p(1, "Archived"), p(2, "Cancelled"), p(3, "Completed"), p(4, "On Hold"), p(5, "Proposal")]);
    assert.deepEqual(sorted.map((r) => r.status), ["Proposal", "On Hold", "Completed", "Cancelled", "Archived"]);
  });

  test("within a group newest update first, then higher id; independent of input order", () => {
    const rows = [p(1, "Design", "2026-03-01"), p(2, "Design", "2026-05-01"), p(3, "Design", "2026-05-01")];
    assert.deepEqual(sortProjects(rows).map((r) => r.id), [3, 2, 1]);
    assert.deepEqual(sortProjects([...rows].reverse()).map((r) => r.id), [3, 2, 1]);
  });

  test("only the status 'Archived' counts as archived — in-progress phases never do", () => {
    for (const s of ["Proposal", "Design", "Pre-Construction", "Construction", "Closeout", "Completed", "On Hold", "Cancelled"]) {
      assert.equal(isArchivedStatus(s), false);
    }
    assert.equal(isArchivedStatus("Archived"), true);
  });

  test("missing update times sort last in their group without throwing", () => {
    assert.ok(compareProjects(p(1, "Design", null), p(2, "Design", "2026-01-01")) > 0);
  });
});
