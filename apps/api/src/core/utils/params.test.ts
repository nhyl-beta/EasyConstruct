import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { parseIdParam } from "./params.js";
import { ValidationError } from "./errors.js";

describe("parseIdParam", () => {
  test("accepts a positive whole number", () => {
    assert.equal(parseIdParam("42"), 42);
    assert.equal(parseIdParam(" 7 "), 7);
  });
  test("anything else is a 400 ValidationError, not NaN", () => {
    for (const bad of ["abc", "1.5", "", "-3", "0", "1e3", "12abc", undefined, null, 7, "99999999999999999999"]) {
      assert.throws(() => parseIdParam(bad), ValidationError, String(bad));
    }
  });
  test("the message names the parameter", () => {
    assert.throws(() => parseIdParam("x", "design id"), /design id/);
  });
});
