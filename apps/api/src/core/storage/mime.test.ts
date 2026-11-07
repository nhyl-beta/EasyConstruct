import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extensionOf, resolveContentType } from "./mime.js";

describe("resolveContentType (B-207)", () => {
  test("a PDF stored as a generic binary is served as a PDF", () => {
    assert.equal(resolveContentType("application/octet-stream", "s3:docs/12-spec.pdf"), "application/pdf");
    assert.equal(resolveContentType("", "/uploads/documents/a.PDF"), "application/pdf");
    assert.equal(resolveContentType(undefined, "https://x.blob.vercel-storage.com/a-AbC123.png?x=1"), "image/png");
  });
  test("a real claimed type is kept", () => {
    assert.equal(resolveContentType("image/jpeg", "photo.png"), "image/jpeg");
    assert.equal(resolveContentType("application/pdf; charset=binary", "a.pdf"), "application/pdf; charset=binary");
  });
  test("an unknown extension stays generic, so it downloads", () => {
    assert.equal(resolveContentType("application/octet-stream", "model.dwg"), "application/octet-stream");
  });
  test("extensionOf ignores folders and query strings", () => {
    assert.equal(extensionOf("/a.b/c"), "");
    assert.equal(extensionOf("/a/b.TXT?x=y.pdf"), ".txt");
  });
});
