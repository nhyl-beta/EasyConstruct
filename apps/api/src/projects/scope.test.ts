import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ASSIGNED_SCOPED_ROLES, canAccessCode, filterRowsByCodes, isAssignedScoped } from "./scope.js";

const rows = [
  { id: 1, project: "P-A" },
  { id: 2, project: "P-B" },
  { id: 3, project: null },
  { id: 4, project: "P-C" },
];

describe("project scope core", () => {
  test("keeps only rows on assigned projects and drops rows with no project", () => {
    const out = filterRowsByCodes(rows, new Set(["P-A", "P-C"]), (r) => r.project);
    assert.deepEqual(out.map((r) => r.id), [1, 4]);
  });

  test("an architect with no assignments sees nothing", () => {
    assert.deepEqual(filterRowsByCodes(rows, new Set(), (r) => r.project), []);
  });

  test("canAccessCode refuses another architect's project and empty codes", () => {
    const mine = new Set(["P-A"]);
    assert.equal(canAccessCode(mine, "P-A"), true);
    assert.equal(canAccessCode(mine, "P-B"), false);
    assert.equal(canAccessCode(mine, null), false);
  });

  test("architect, consultant and project manager are scoped; oversight and company-wide roles are untouched", () => {
    for (const role of ["architect", "consultant", "project-manager"]) {
      assert.equal(isAssignedScoped({ id: 1, role }), true, role);
    }
    for (const role of ["admin", "owner", "it-designer", "finance-manager", "human-resources"]) {
      assert.equal(isAssignedScoped({ id: 1, role }), false, role);
    }
    assert.equal(isAssignedScoped(undefined), false);
    assert.ok(ASSIGNED_SCOPED_ROLES.has("consultant") && ASSIGNED_SCOPED_ROLES.has("project-manager"));
  });

  test("a PM scoped to two projects sees only their rows, designs / blueprints / proposals alike", () => {
    // Twelve rows across seven projects, as in the system check: the PM manages S6 and S7.
    const all = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, project: `DEMO-S${(i % 7) + 1}` }));
    const mine = filterRowsByCodes(all, new Set(["DEMO-S6", "DEMO-S7"]), (r) => r.project);
    assert.ok(mine.length > 0 && mine.length < all.length);
    assert.ok(mine.every((r) => r.project === "DEMO-S6" || r.project === "DEMO-S7"));
  });

  test("a consultant is refused a project they are not staffed on", () => {
    assert.equal(canAccessCode(new Set(["P-A"]), "P-FOREIGN"), false);
  });
});
