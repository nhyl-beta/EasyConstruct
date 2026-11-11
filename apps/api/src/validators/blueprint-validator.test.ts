import assert from "node:assert/strict";
import { test } from "node:test";
import { createBlueprintSchema, updateBlueprintSchema } from "./blueprint-validator.js";

const base = { drawingNumber: "A-101", title: "Ground floor plan", folder: "Structural" };

test("an architect cannot approve a drawing while creating it", () => {
  const parsed = createBlueprintSchema.parse({ ...base, approval: "Approved" });
  assert.equal("approval" in parsed, false);
});

test("a drawing can carry the url of its uploaded DWG", () => {
  const parsed = createBlueprintSchema.parse({ ...base, fileUrl: "/uploads/generic/1-2-plan.dwg", fileType: "DWG", sizeKb: 48000 });
  assert.equal(parsed.fileUrl, "/uploads/generic/1-2-plan.dwg");
});

test("the thumbnail must be a JPEG data url, nothing else", () => {
  assert.ok(createBlueprintSchema.safeParse({ ...base, thumbnail: "data:image/jpeg;base64,/9j/4AAQ" }).success);
  assert.equal(createBlueprintSchema.safeParse({ ...base, thumbnail: "javascript:alert(1)" }).success, false);
  assert.equal(createBlueprintSchema.safeParse({ ...base, thumbnail: "data:text/html;base64,PHNjcmlwdD4=" }).success, false);
});

test("an architect cannot approve or re-author a drawing through PATCH", () => {
  const parsed = updateBlueprintSchema.parse({ title: "New title", approval: "Approved", author: "Someone else" });
  assert.deepEqual(parsed, { title: "New title" });
});
