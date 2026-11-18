import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { RECURRENCE_MIN, suggestResolution } from "./suggestions.js";

const none = { sameCategoryOpen: 0, overdueTasks: 0, slippingMilestones: 0 };

describe("suggestResolution", () => {
  test("every category gets first steps that name their playbook", () => {
    for (const category of ["Technical", "Structural", "Material", "Schedule", "Resource", "Quality", "Safety", "Other"]) {
      const s = suggestResolution({ category, severity: "Medium" }, none);
      assert.ok(s.firstSteps.length > 0, category);
      assert.equal(s.firstSteps[0]!.basis, `Playbook: ${category}`);
    }
  });

  test("an unknown category falls back to Other, an unknown severity to Medium", () => {
    const s = suggestResolution({ category: "Plumbing", severity: "Weird" }, none);
    assert.equal(s.firstSteps[0]!.basis, "Playbook: Other");
    assert.match(s.urgency.text, /within a week/);
  });

  test("Critical tells the PM today", () => {
    assert.match(suggestResolution({ category: "Safety", severity: "Critical" }, none).urgency.text, /today.*Project Manager/);
  });

  test("no project problems means no context lines", () => {
    assert.deepEqual(suggestResolution({ category: "Material", severity: "Low" }, none).context, []);
  });

  test("context lines appear only when their rule fires, each with its basis", () => {
    const below = suggestResolution({ category: "Material", severity: "Low" }, { ...none, sameCategoryOpen: RECURRENCE_MIN - 1 });
    assert.equal(below.context.length, 0, "one other issue is not yet a pattern");

    const s = suggestResolution({ category: "Material", severity: "Low" }, { sameCategoryOpen: 3, overdueTasks: 1, slippingMilestones: 2 });
    assert.equal(s.context.length, 3);
    assert.match(s.context[0]!.text, /3 other open issues are also Material/);
    assert.match(s.context[1]!.text, /1 task is past/);
    assert.match(s.context[2]!.text, /2 milestones are past/);
    assert.ok(s.context.every((c) => c.basis.startsWith("Rule:")));
  });
});
