import { describe, test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_SECRET ??= "test";

import { isBlobClientUploadBody } from "./limits.js";

describe("isBlobClientUploadBody", () => {
  test("the two Blob protocol payloads are accepted", () => {
    assert.equal(isBlobClientUploadBody({ type: "blob.generate-client-token", payload: { pathname: "a.pdf" } }), true);
    assert.equal(isBlobClientUploadBody({ type: "blob.upload-completed", payload: { blob: {} } }), true);
  });
  test("an empty, junk or half-formed body is not (the sweep's 500s)", () => {
    for (const bad of [undefined, null, {}, { x: 1 }, "text", 5, [], { type: "blob.generate-client-token" }, { type: "other", payload: {} }, { type: "blob.upload-completed", payload: "x" }]) {
      assert.equal(isBlobClientUploadBody(bad), false, JSON.stringify(bad));
    }
  });
});
