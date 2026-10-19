import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assertAdvisoryHasFile, resolveRelatedItem, type RelatedLookup } from "./advisory.js";
import { ValidationError } from "../utils/errors.js";

const lookup: RelatedLookup = async (type, id) => {
  if (type === "proposal" && id === 1) return { projectCode: "PRJ-1" };
  if (type === "design" && id === 2) return { projectCode: "PRJ-1" };
  if (type === "proposal" && id === 3) return { projectCode: "PRJ-OTHER" };
  return null;
};

describe("assertAdvisoryHasFile", () => {
  test("consultant upload without a file is rejected", () => {
    assert.throws(() => assertAdvisoryHasFile("consultant", false), ValidationError);
  });
  test("consultant upload with a file is accepted", () => {
    assert.doesNotThrow(() => assertAdvisoryHasFile("consultant", true));
  });
  test("other roles are not affected by the advisory rule", () => {
    assert.doesNotThrow(() => assertAdvisoryHasFile("project-manager", false));
  });
});

describe("resolveRelatedItem", () => {
  test("no related item is fine", async () => {
    assert.deepEqual(await resolveRelatedItem("PRJ-1", {}, lookup), {});
  });
  test("accepts a related proposal and design on the same project (ids may arrive as strings)", async () => {
    assert.deepEqual(await resolveRelatedItem("PRJ-1", { relatedType: "proposal", relatedId: "1" }, lookup), {
      relatedType: "proposal",
      relatedId: 1,
    });
    assert.deepEqual(await resolveRelatedItem("PRJ-1", { relatedType: "design", relatedId: 2 }, lookup), {
      relatedType: "design",
      relatedId: 2,
    });
  });
  test("rejects a related item from another project", async () => {
    await assert.rejects(resolveRelatedItem("PRJ-1", { relatedType: "proposal", relatedId: 3 }, lookup), ValidationError);
  });
  test("rejects a missing item, an unknown type, and a half-given relation", async () => {
    await assert.rejects(resolveRelatedItem("PRJ-1", { relatedType: "design", relatedId: 99 }, lookup), ValidationError);
    await assert.rejects(resolveRelatedItem("PRJ-1", { relatedType: "blueprint", relatedId: 1 }, lookup), ValidationError);
    await assert.rejects(resolveRelatedItem("PRJ-1", { relatedType: "proposal" }, lookup), ValidationError);
    await assert.rejects(resolveRelatedItem("PRJ-1", { relatedId: 1 }, lookup), ValidationError);
  });
});
