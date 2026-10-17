import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  isStageOverdue,
  manilaDay,
  stageAgeHours,
  stageOverdueHours,
} from "./overdue.js";

describe("stage age", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  test("counts whole hours since the stage became active", () => {
    assert.equal(stageAgeHours(new Date("2026-10-10T00:00:00Z"), now), 12);
    assert.equal(stageAgeHours(new Date("2026-10-08T12:00:00Z"), now), 48);
    assert.equal(stageAgeHours(new Date("2026-10-08T12:30:00Z"), now), 47);
  });

  test("never negative when the clock is a little off", () => {
    assert.equal(stageAgeHours(new Date("2026-10-11T00:00:00Z"), now), 0);
  });

  test("overdue at 48 hours, not at 47", () => {
    assert.equal(isStageOverdue(new Date("2026-10-08T12:00:00Z"), now, 48), true);
    assert.equal(isStageOverdue(new Date("2026-10-08T13:00:00Z"), now, 48), false);
  });

  test("the threshold is 48 hours unless configured", () => {
    assert.equal(stageOverdueHours(undefined), 48);
    assert.equal(stageOverdueHours("72"), 72);
    assert.equal(stageOverdueHours("nonsense"), 48);
    assert.equal(stageOverdueHours("0"), 48);
    assert.equal(isStageOverdue(new Date("2026-10-08T12:00:00Z"), now, stageOverdueHours("72")), false);
  });
});
