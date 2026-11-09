import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { statusesFor } from "./status-group.js";

describe("design revision statuses are one group (B-204)", () => {
  test("filtering by either revision word selects both", () => {
    assert.deepEqual(statusesFor("Revision Needed"), ["Revision Needed", "Revision Required"]);
    assert.deepEqual(statusesFor("Revision Required"), ["Revision Needed", "Revision Required"]);
  });
  test("other statuses stay alone", () => {
    assert.deepEqual(statusesFor("Approved"), ["Approved"]);
  });
});
