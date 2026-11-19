import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildRoster } from "./demo-roster.js";

describe("buildRoster", () => {
  test("produces 54 rows with unique employee IDs, matching seed-demo-accounts.ts's 46 account-linked rows for 100 employees total", () => {
    const rows = buildRoster();
    assert.equal(rows.length, 54);
    assert.equal(new Set(rows.map((r) => r.employeeId)).size, 54);
  });

  test("includes each of the four named people exactly once", () => {
    const rows = buildRoster();
    for (const name of ["Dirk Louisse R. Villaflor", "Gian Carl Q. Dela Rosa", "Mark Gabriel A. Yoldi", "Nhyl Cyrus J. Gervasio"]) {
      assert.equal(rows.filter((r) => r.name === name).length, 1, `${name} should appear exactly once`);
    }
  });
});
