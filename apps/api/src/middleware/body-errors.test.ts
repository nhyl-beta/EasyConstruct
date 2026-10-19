import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mapBodyParserError } from "./body-errors.js";

describe("mapBodyParserError", () => {
  test("malformed JSON is a 400 INVALID_JSON, as body-parser reports it", () => {
    const err = Object.assign(new SyntaxError("Unexpected token b in JSON at position 1"), { type: "entity.parse.failed", status: 400, statusCode: 400 });
    const m = mapBodyParserError(err)!;
    assert.equal(m.status, 400);
    assert.equal(m.code, "INVALID_JSON");
    assert.doesNotMatch(m.message, /position|token/i, "no parser internals in the message");
  });
  test("an unsupported encoding is a 415", () => {
    assert.equal(mapBodyParserError({ type: "encoding.unsupported" })!.status, 415);
  });
  test("an aborted or mis-sized body is a 400", () => {
    assert.equal(mapBodyParserError({ type: "request.aborted" })!.status, 400);
  });
  test("oversized bodies and everything else are left to the other handlers", () => {
    assert.equal(mapBodyParserError({ type: "entity.too.large" }), null);
    assert.equal(mapBodyParserError(new Error("boom")), null);
    assert.equal(mapBodyParserError(null), null);
  });
});
