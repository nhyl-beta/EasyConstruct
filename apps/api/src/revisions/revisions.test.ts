import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createRevisionSchema, revisionStatusSchema } from "../validators/revision-validators.js";
import router from "./routes.js";

const file = { url: "/uploads/generic/123-plan.pdf", fileName: "plan.pdf", fileSize: 1024, mimeType: "application/pdf" };
const valid = { projectCode: "PRJ-1", itemType: "design", itemId: 3, changeSummary: "Moved the stair core east", file };

describe("create revision validator", () => {
  test("accepts a revision of an existing item", () => {
    assert.equal(createRevisionSchema.safeParse(valid).success, true);
  });

  test("a file is required", () => {
    const { file: _omit, ...rest } = valid;
    assert.equal(createRevisionSchema.safeParse(rest).success, false);
  });

  test("a change summary is required and must say something", () => {
    assert.equal(createRevisionSchema.safeParse({ ...valid, changeSummary: "" }).success, false);
    assert.equal(createRevisionSchema.safeParse({ ...valid, changeSummary: "   x " }).success, false);
    const { changeSummary: _omit, ...rest } = valid;
    assert.equal(createRevisionSchema.safeParse(rest).success, false);
  });

  test("the file must come from the app's own storage", () => {
    const bad = { ...valid, file: { ...file, url: "https://evil.example.com/plan.pdf" } };
    assert.equal(createRevisionSchema.safeParse(bad).success, false);
    const blob = { ...valid, file: { ...file, url: "https://abc.private.blob.vercel-storage.com/easyconstruct/plan.pdf" } };
    assert.equal(createRevisionSchema.safeParse(blob).success, true);
  });

  test("item type is one of the four; an item is chosen or started, not both or neither", () => {
    assert.equal(createRevisionSchema.safeParse({ ...valid, itemType: "spreadsheet" }).success, false);
    const { itemId: _omit, ...noItem } = valid;
    assert.equal(createRevisionSchema.safeParse(noItem).success, false);
    assert.equal(createRevisionSchema.safeParse({ ...valid, newItem: { title: "Ground floor plan" }, itemType: "plan" }).success, false);
  });

  test("a new tracked item can only be a plan", () => {
    const { itemId: _omit, ...noItem } = valid;
    assert.equal(createRevisionSchema.safeParse({ ...noItem, itemType: "plan", newItem: { title: "Ground floor plan" } }).success, true);
    assert.equal(createRevisionSchema.safeParse({ ...noItem, itemType: "design", newItem: { title: "Ground floor plan" } }).success, false);
  });
});

describe("status validator", () => {
  test("only known statuses", () => {
    assert.equal(revisionStatusSchema.safeParse({ status: "Approved" }).success, true);
    assert.equal(revisionStatusSchema.safeParse({ status: "Maybe" }).success, false);
  });
});

describe("history is immutable (route surface)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layers = (router as any).stack.filter((l: any) => l.route).map((l: any) => ({
    path: l.route.path as string,
    methods: Object.keys(l.route.methods),
  }));

  test("no route edits or deletes a revision's content", () => {
    for (const l of layers) {
      assert.ok(!l.methods.includes("delete"), l.path + " must not allow DELETE");
      assert.ok(!l.methods.includes("put"), l.path + " must not allow PUT");
    }
  });

  test("the only PATCH is the status transition", () => {
    const patches = layers.filter((l: { methods: string[] }) => l.methods.includes("patch"));
    assert.deepEqual(patches.map((l: { path: string }) => l.path), ["/:id/status"]);
  });

  test("fixed paths are registered before /:id so they are not read as ids", () => {
    const order = layers.map((l: { path: string }) => l.path);
    for (const fixed of ["/summary", "/compare", "/by-item/:itemType/:itemId"]) {
      assert.ok(order.indexOf(fixed) < order.indexOf("/:id"), fixed + " must come before /:id");
    }
  });
});
