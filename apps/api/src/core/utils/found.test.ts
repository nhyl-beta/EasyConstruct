import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { orNotFound } from "./found.js";
import { NotFoundError } from "./errors.js";

describe("orNotFound", () => {
  test("a missing row is a 404 NotFoundError that names the resource and id", () => {
    assert.throws(() => orNotFound(null, "Requirement", 99999), (e: unknown) => e instanceof NotFoundError && e.statusCode === 404 && /Requirement 99999/.test(e.message));
    assert.throws(() => orNotFound(undefined, "Requirement", 1), NotFoundError);
  });
  test("a found row is returned unchanged, including falsy-looking rows", () => {
    const row = { id: 1 };
    assert.equal(orNotFound(row, "Requirement", 1), row);
    assert.equal(orNotFound(0, "x", 1), 0);
  });
});
