import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { statusesFor } from "./status-group.js";
import { designKpis } from "../../projects/dashboard/aggregates.js";

describe("design revision statuses are one group (B-204)", () => {
  test("filtering by either revision word selects both", () => {
    assert.deepEqual(statusesFor("Revision Needed"), ["Revision Needed", "Revision Required"]);
    assert.deepEqual(statusesFor("Revision Required"), ["Revision Needed", "Revision Required"]);
  });
  test("other statuses stay alone", () => {
    assert.deepEqual(statusesFor("Approved"), ["Approved"]);
  });
  test("the dashboard card counts both words", () => {
    const k = designKpis([{ status: "Revision Needed" }, { status: "Revision Required", n: 2 }, { status: "Approved" }]);
    assert.equal(k.revisionNeeded, 3);
    assert.equal(k.approved, 1);
  });
});
