import { test } from "node:test";
import assert from "node:assert/strict";
import { formatId } from "./ids.js";

test("ids are zero-padded and grow past four digits", () => {
  assert.equal(formatId("PR", 7), "PR-0007");
  assert.equal(formatId("PO", 1), "PO-0001");
  assert.equal(formatId("EXP", 12345), "EXP-12345");
});
