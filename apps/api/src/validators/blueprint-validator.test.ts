import assert from "node:assert/strict";
import { test } from "node:test";
import { createBlueprintSchema, updateBlueprintSchema } from "./blueprint-validator.js";

const base = { drawingNumber: "A-101", title: "Ground floor plan", folder: "Structural" };

test("an architect cannot approve a drawing while creating it", () => {
  const parsed = createBlueprintSchema.parse({ ...base, approval: "Approved" });
  assert.equal("approval" in parsed, false);
});

test("an architect cannot approve or re-author a drawing through PATCH", () => {
  const parsed = updateBlueprintSchema.parse({ title: "New title", approval: "Approved", author: "Someone else" });
  assert.deepEqual(parsed, { title: "New title" });
});
