import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LISTED,
  checkBatchHours,
  checkBatchTotals,
  checkBudgetActual,
  checkInactiveMembers,
  checkOrphans,
  checkProgress,
  summarize,
} from "./checks.js";

describe("project progress", () => {
  test("passes when stored equals computed, fails with a link to the first mismatch", () => {
    const pass = checkProgress([{ code: "A", status: "Construction", stored: 40, expected: 40 }]);
    assert.equal(pass.status, "pass");
    assert.equal(pass.firstLink, null);

    const fail = checkProgress([
      { code: "A", status: "Construction", stored: 40, expected: 40 },
      { code: "B", status: "Construction", stored: 40, expected: 55 },
      { code: "C", status: "Design", stored: 10, expected: 12 },
    ]);
    assert.equal(fail.status, "fail");
    assert.equal(fail.checked, 3);
    assert.equal(fail.mismatchCount, 2);
    assert.equal(fail.firstLink, "/projects/B");
    assert.match(fail.mismatches[0]!.detail, /Stored progress is 40% but .* 55%/);
  });
  test("an empty set passes", () => {
    assert.equal(checkProgress([]).status, "pass");
  });
});

describe("budget actuals", () => {
  test("expenses plus payroll explain the actual; a gap beyond a peso does not", () => {
    const ok = checkBudgetActual([{ project: "A", actual: 1500, approvedExpenses: 1000, approvedPayroll: 500 }]);
    assert.equal(ok.status, "pass");
    const tolerated = checkBudgetActual([{ project: "A", actual: 1500.5, approvedExpenses: 1000, approvedPayroll: 500 }]);
    assert.equal(tolerated.status, "pass");
    const bad = checkBudgetActual([{ project: "A", actual: 2000, approvedExpenses: 1000, approvedPayroll: 500 }]);
    assert.equal(bad.status, "fail");
    assert.match(bad.mismatches[0]!.detail, /difference .*500/);
  });
  test("spend with nothing booked is a mismatch in the other direction", () => {
    const r = checkBudgetActual([{ project: "A", actual: 0, approvedExpenses: 800, approvedPayroll: 0 }]);
    assert.equal(r.status, "fail");
    assert.match(r.mismatches[0]!.detail, /difference .*-800/);
  });
});

describe("payroll batch totals", () => {
  const base = { id: "PAY-1", status: "approved", headerEmployees: 2, headerGross: 3000, headerNet: 2700, lineCount: 2, lineGross: 3000, lineNet: 2700 };
  test("matching header and lines pass", () => {
    assert.equal(checkBatchTotals([base]).status, "pass");
  });
  test("a wrong count, gross or net each fail and are named", () => {
    const r = checkBatchTotals([{ ...base, lineCount: 3 }, { ...base, id: "PAY-2", lineGross: 3100 }, { ...base, id: "PAY-3", lineNet: 2000 }]);
    assert.equal(r.mismatchCount, 3);
    assert.match(r.mismatches[0]!.detail, /2 employees on the batch but 3 lines/);
    assert.match(r.mismatches[1]!.detail, /gross/);
    assert.match(r.mismatches[2]!.detail, /net/);
  });
});

describe("payroll hours against attendance", () => {
  test("within an hour passes, beyond fails", () => {
    assert.equal(checkBatchHours([{ id: "P1", projectCode: "A", period: "2026-07", lineHours: 160, verifiedHours: 160.5 }]).status, "pass");
    const bad = checkBatchHours([{ id: "P1", projectCode: "A", period: "2026-07", lineHours: 200, verifiedHours: 160 }]);
    assert.equal(bad.status, "fail");
    assert.match(bad.mismatches[0]!.detail, /pay 200 hours; verified attendance supports 160/);
  });
});

describe("orphans and inactive members", () => {
  test("a task pointing at a missing project fails with its link", () => {
    const r = checkOrphans("orphan-tasks", "Tasks have a project", "Each task against the projects table.", 5, [
      { table: "tasks", id: 7, reference: "project GHOST-1", link: "/tasks" },
    ]);
    assert.equal(r.status, "fail");
    assert.equal(r.firstLink, "/tasks");
    assert.match(r.mismatches[0]!.detail, /GHOST-1/);
  });
  test("none found passes", () => {
    assert.equal(checkOrphans("k", "t", "b", 3, []).status, "pass");
  });
  test("staffed people with a deactivated account are listed", () => {
    const r = checkInactiveMembers(4, [{ id: 1, projectCode: "A", userName: "Sam" }]);
    assert.equal(r.status, "fail");
    assert.equal(r.firstLink, "/projects/A");
  });
});

test("the listed mismatches are capped but the count is not", () => {
  const rows = Array.from({ length: MAX_LISTED + 15 }, (_, i) => ({ code: `P${i}`, status: "Construction", stored: 1, expected: 2 }));
  const r = checkProgress(rows);
  assert.equal(r.mismatchCount, MAX_LISTED + 15);
  assert.equal(r.mismatches.length, MAX_LISTED);
});

test("summarize", () => {
  const s = summarize([checkProgress([]), checkProgress([{ code: "A", status: "x", stored: 1, expected: 2 }])]);
  assert.deepEqual(s, { passed: false, failing: 1, total: 2 });
});
