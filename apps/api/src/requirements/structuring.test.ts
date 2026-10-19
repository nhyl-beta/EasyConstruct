import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { structureRequirement } from "./structuring.js";

const SLAB = "Need concrete slab for the warehouse floor, around 320 sqm";

describe("structureRequirement", () => {
  test("produces the four fixed headings in order", () => {
    const r = structureRequirement({ text: SLAB });
    const headings = ["Objectives", "Materials", "Constraints", "Specifications"];
    let last = -1;
    for (const h of headings) {
      const at = r.description.indexOf(h);
      assert.ok(at > last, `${h} out of order`);
      last = at;
    }
  });

  test("routes clauses to sections: intent → objectives, number+unit → specifications", () => {
    const r = structureRequirement({ text: SLAB });
    assert.ok(r.sections.objectives.some((c) => /concrete slab/i.test(c)));
    assert.ok(r.sections.specifications.some((c) => /320/.test(c)));
    assert.equal(r.category, "Specifications");
  });

  test("routes constraints and materials", () => {
    const r = structureRequirement({
      text: "Provide a drainage layer. Gravel bedding. Work must be completed within 14 days.",
    });
    assert.ok(r.sections.materials.some((c) => /gravel/i.test(c)));
    assert.ok(r.sections.constraints.some((c) => /14 days/.test(c)));
  });

  test("unrouted clauses land in objectives, never dropped", () => {
    const r = structureRequirement({ text: "Coordinate with the neighbours about noise" });
    assert.equal(r.sections.objectives.length, 1);
  });

  test("suggests missing concrete elements and not the ones already present", () => {
    const r = structureRequirement({ text: SLAB });
    assert.equal(r.workType, "concrete");
    const texts = r.suggestions.map((s) => s.text.toLowerCase());
    assert.ok(texts.some((t) => t.includes("strength grade")));
    assert.ok(texts.some((t) => t.includes("thickness")));
    assert.ok(texts.some((t) => t.includes("curing")));
    assert.ok(texts.some((t) => t.includes("reinforcement")));

    const covered = structureRequirement({
      text: "Concrete slab, 21 MPa, 150 mm thick, 7 day curing with rebar mesh, slump test required, 320 sqm",
    });
    const t2 = covered.suggestions.map((s) => s.text.toLowerCase());
    assert.ok(!t2.some((t) => t.includes("strength grade")));
    assert.ok(!t2.some((t) => t.includes("thickness")));
    assert.ok(!t2.some((t) => t.includes("curing")));
    assert.ok(!t2.some((t) => t.includes("reinforcement")));
    assert.ok(!t2.some((t) => t.includes("quality testing")));
  });

  test("no duplicate suggestions", () => {
    const r = structureRequirement({ text: SLAB });
    const texts = r.suggestions.map((s) => s.text);
    assert.equal(new Set(texts).size, texts.length);
  });

  test("suggestions are not part of the description", () => {
    const r = structureRequirement({ text: SLAB });
    for (const s of r.suggestions) assert.ok(!r.description.includes(s.text));
  });

  test("vague wording is rewritten and every rewrite is reported", () => {
    const r = structureRequirement({ text: "Use good quality gravel ASAP" });
    assert.ok(r.rewrites.some((w) => w.from.toLowerCase() === "good quality gravel"));
    assert.ok(r.rewrites.some((w) => w.from.toLowerCase() === "asap"));
    assert.ok(!/good quality/i.test(r.description));
    assert.ok(/gravel conforming to applicable project standards/.test(r.description));
    assert.ok(r.sections.materials.some((c) => /gravel/i.test(c)));
    assert.ok(/approved schedule/.test(r.description));
  });

  test("is deterministic", () => {
    assert.deepEqual(structureRequirement({ text: SLAB }), structureRequirement({ text: SLAB }));
  });

  test("empty input yields empty sections and category Other", () => {
    const r = structureRequirement({ text: "   " });
    assert.equal(r.category, "Other");
    assert.deepEqual(r.sections.objectives, []);
    assert.deepEqual(r.rewrites, []);
  });

  test("text with no recognizable work type falls back to the general template", () => {
    const r = structureRequirement({ text: "Arrange a coordination meeting with the owner" });
    assert.equal(r.workType, "general");
    assert.ok(r.suggestions.some((s) => /standard or code/i.test(s.text)));
  });
});
