import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DRAFT_CATEGORIES, generateDraft, packFor } from "./templates.js";

const base = { projectCode: "P-1", projectName: "Test", projectType: "Residential", category: "Materials" };

describe("template selection", () => {
  test("each category and project type picks its own pack", () => {
    const resMaterials = packFor("Materials", "Residential");
    const infraMaterials = packFor("Materials", "Infrastructure");
    assert.ok(resMaterials.some((i) => i.includes("Wall, floor and roof finishes")));
    assert.ok(infraMaterials.some((i) => i.includes("Pavement, aggregate or pipe materials")));
    assert.ok(!resMaterials.some((i) => i.includes("Pavement")));
    assert.notDeepEqual(packFor("Constraints", "Residential"), packFor("Specifications", "Residential"));
  });

  test("an unknown or missing project type gets only the generic items", () => {
    assert.deepEqual(packFor("Objectives", "Spaceport"), packFor("Objectives", null));
    assert.ok(packFor("Objectives", null).length >= 2);
  });

  test("Other has no pack", () => {
    assert.deepEqual(packFor("Other", "Residential"), []);
  });

  test("the four real categories are the drafting categories", () => {
    assert.deepEqual([...DRAFT_CATEGORIES].sort(), ["Constraints", "Materials", "Objectives", "Specifications"]);
  });
});

describe("output shape", () => {
  test("matches the StructuredRequirement shape and fills the chosen category", () => {
    const d = generateDraft(base);
    assert.equal(d.category, "Materials");
    assert.deepEqual(Object.keys(d.sections).sort(), ["constraints", "materials", "objectives", "specifications"]);
    assert.ok(d.sections.materials.length >= 3);
    assert.deepEqual(d.sections.objectives, []);
    assert.deepEqual(d.suggestions, []);
    assert.deepEqual(d.rewrites, []);
    assert.match(d.description, /^Objectives\n- \(none stated\)/);
    assert.match(d.description, /Materials\n- Principal materials/);
    assert.equal(typeof d.workType, "string");
  });

  test("every item is a prompt with a blank or a plain statement, never an empty string", () => {
    for (const category of DRAFT_CATEGORIES) {
      const d = generateDraft({ ...base, category });
      for (const items of Object.values(d.sections)) for (const item of items) assert.ok(item.trim().length > 10);
    }
  });

  test("an unknown category falls back to Other with no pack items", () => {
    const d = generateDraft({ ...base, category: "Nonsense" });
    assert.equal(d.category, "Other");
    assert.deepEqual(d.sections.materials, []);
  });
});

describe("keywords from the approved proposal or design", () => {
  test("concrete and roofing in the proposal add items to the right sections, across categories", () => {
    const d = generateDraft({ ...base, category: "Constraints", proposalText: "Two storey house with a concrete slab and a steel truss roof." });
    assert.ok(d.sections.materials.some((i) => i.includes("Concrete mix and reinforcement")));
    assert.ok(d.sections.specifications.some((i) => i.includes("Concrete testing")));
    assert.ok(d.sections.materials.some((i) => i.includes("Roofing sheet type")));
    assert.ok(d.basis.some((b) => b.includes("concrete") && b.includes("roofing") && b.includes("the approved proposal")));
    assert.equal(d.workType, "concrete");
  });

  test("the design text is read too, and named in the basis", () => {
    const d = generateDraft({ ...base, designText: "Plumbing layout and septic tank details" });
    assert.ok(d.sections.materials.some((i) => i.includes("Pipe material and diameter")));
    assert.ok(d.basis.some((b) => b.includes("the design")));
  });

  test("no source text says so in the basis and adds nothing", () => {
    const d = generateDraft(base);
    assert.ok(d.basis.some((b) => b.includes("No approved proposal or design text")));
    assert.equal(d.sections.specifications.length, 0);
  });

  test("source text without any work-type keyword says so", () => {
    const d = generateDraft({ ...base, proposalText: "A building for a family." });
    assert.ok(d.basis.some((b) => b.includes("No work-type keywords")));
  });

  test("items are not duplicated when a keyword item matches a pack item", () => {
    const d = generateDraft({ ...base, category: "Materials", proposalText: "steel truss and steel girder" });
    const all = d.sections.materials;
    assert.equal(new Set(all).size, all.length);
  });
});
