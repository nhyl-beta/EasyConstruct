import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mapPgError } from "./pg-errors.js";

const wrapped = (code: string, detail?: string) => Object.assign(new Error("Failed query"), { cause: { code, detail } });

describe("mapPgError", () => {
  test("22P02 invalid text representation (a bad id) is a 400 VALIDATION_ERROR", () => {
    const m = mapPgError(wrapped("22P02"))!;
    assert.equal(m.status, 400);
    assert.equal(m.code, "VALIDATION_ERROR");
  });
  test("23502 not-null violation (an empty body) is a 400 VALIDATION_ERROR", () => {
    assert.equal(mapPgError(wrapped("23502"))!.status, 400);
  });
  test("23503 foreign-key violation is a 409", () => {
    const m = mapPgError(wrapped("23503"))!;
    assert.equal(m.status, 409);
    assert.equal(m.code, "CONFLICT");
  });
  test("23505 unique violation is still a 409 and keeps the pg detail", () => {
    const m = mapPgError(wrapped("23505", "Key (code)=(X) already exists."))!;
    assert.equal(m.status, 409);
    assert.equal(m.message, "Key (code)=(X) already exists.");
  });
  test("the code is read from the error itself or from its cause", () => {
    assert.equal(mapPgError(Object.assign(new Error("x"), { code: "22P02" }))!.status, 400);
  });
  test("other errors are not mapped (they stay 500) and never throw", () => {
    assert.equal(mapPgError(new Error("boom")), null);
    assert.equal(mapPgError(wrapped("42P01")), null);
    assert.equal(mapPgError(null), null);
    assert.equal(mapPgError(undefined), null);
    assert.equal(mapPgError("text"), null);
  });
  test("the message never contains SQL or table names", () => {
    for (const code of ["22P02", "23502", "23503"]) assert.doesNotMatch(mapPgError(wrapped(code))!.message, /select|insert|update|relation|column/i);
  });
});
