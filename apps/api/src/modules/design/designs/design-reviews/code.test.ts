import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { newReviewCode } from "./code.js";

describe("newReviewCode", () => {
  test("fits the 20-character column and does not repeat across rapid calls", () => {
    const codes = Array.from({ length: 2000 }, newReviewCode);
    for (const c of codes) assert.ok(c.length <= 20 && c.startsWith("REV-"), c);
    assert.equal(new Set(codes).size, codes.length);
  });
});
