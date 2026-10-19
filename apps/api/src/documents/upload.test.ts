import { test } from "node:test";
import assert from "node:assert/strict";
import { upload } from "./controller.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { Response } from "express";

// The upload handler refuses a request with no file before touching the
// database, so advisory documents can never be saved file-less through it.
test("upload without a file is rejected with FILE_REQUIRED", async () => {
  let status = 0;
  let body: { code?: string } = {};
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: { code?: string }) {
      body = payload;
      return this;
    },
  } as unknown as Response;
  const req = {
    body: { project: "PRJ-1", type: "PDF" },
    authUser: { id: 1, email: "c@x.test", name: "C", role: "consultant" },
  } as unknown as AuthedRequest;

  await upload(req, res, () => assert.fail("should not call next"));
  assert.equal(status, 400);
  assert.equal(body.code, "FILE_REQUIRED");
});
