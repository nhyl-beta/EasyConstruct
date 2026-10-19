import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MEMBERSHIP_SCOPED_ROLES, filterRowsToCodes, isSkipped, visibilityModeFor } from "./visibility.js";

const rows = [
  { id: 1, project: "A" },
  { id: 2, project: "B" },
  { id: 3, project: null },
  { id: 4, project: "A" },
];

describe("visibilityModeFor", () => {
  test("PM sees own projects; engineer, architect, site-personnel, consultant see staffed projects", () => {
    assert.equal(visibilityModeFor("project-manager"), "own-projects");
    for (const r of ["engineer", "architect", "site-personnel", "consultant"]) {
      assert.equal(visibilityModeFor(r), "staffed-projects");
      assert.ok(MEMBERSHIP_SCOPED_ROLES.has(r));
    }
  });
  test("admin, it-designer, owner, HR and finance are unrestricted", () => {
    for (const r of ["admin", "it-designer", "owner", "human-resources", "finance-manager"]) {
      assert.equal(visibilityModeFor(r), "all");
    }
  });
});

describe("filterRowsToCodes", () => {
  test("an engineer staffed on A sees A's rows and not B's", () => {
    const out = filterRowsToCodes(rows, new Set(["A"]), (r) => r.project);
    assert.deepEqual(out.map((r) => r.id), [1, 4]);
  });
  test("rows with no project are dropped when restricted", () => {
    assert.deepEqual(filterRowsToCodes(rows, new Set(["A", "B"]), (r) => r.project).map((r) => r.id), [1, 2, 4]);
  });
  test("someone staffed nowhere sees nothing", () => {
    assert.deepEqual(filterRowsToCodes(rows, new Set(), (r) => r.project), []);
  });
  test("null codes means unrestricted: the admin sees everything, including unassigned rows", () => {
    assert.equal(filterRowsToCodes(rows, null, (r) => r.project).length, rows.length);
  });
  test("a PM with a different set of own projects does not see another PM's rows", () => {
    const pm1 = filterRowsToCodes(rows, new Set(["A"]), (r) => r.project);
    const pm2 = filterRowsToCodes(rows, new Set(["B"]), (r) => r.project);
    assert.deepEqual(pm1.map((r) => r.id), [1, 4]);
    assert.deepEqual(pm2.map((r) => r.id), [2]);
  });
});

describe("isSkipped", () => {
  test("only roles named in skipRoles skip scoping", () => {
    assert.equal(isSkipped("site-personnel", { skipRoles: ["site-personnel"] }), true);
    assert.equal(isSkipped("engineer", { skipRoles: ["site-personnel"] }), false);
    assert.equal(isSkipped("engineer", {}), false);
    assert.equal(isSkipped(undefined, { skipRoles: ["site-personnel"] }), false);
  });
});
