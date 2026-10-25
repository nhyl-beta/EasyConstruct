import { test, describe, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  MILESTONE_DATE_PAST_MESSAGE,
  createMilestoneSchema,
  milestoneDateIssue,
  redateIssue,
  updateMilestoneSchema,
} from "./validators.js";

// 2026-10-12 12:00 in Manila.
const NOON_MANILA = new Date("2026-10-12T04:00:00Z");
// 2026-10-12 02:00 in Manila — the UTC date is still 2026-10-11.
const EARLY_MANILA = new Date("2026-10-11T18:00:00Z");
// 2026-10-12 23:59 in Manila.
const LATE_MANILA = new Date("2026-10-12T15:59:00Z");
// 2026-10-13 00:00 in Manila — the day has just turned.
const MIDNIGHT_MANILA = new Date("2026-10-12T16:00:00Z");

describe("milestoneDateIssue", () => {
  test("yesterday is rejected, today and later are accepted", () => {
    assert.equal(milestoneDateIssue("2026-10-11", NOON_MANILA), MILESTONE_DATE_PAST_MESSAGE);
    assert.equal(milestoneDateIssue("2026-10-12", NOON_MANILA), null);
    assert.equal(milestoneDateIssue("2026-10-13", NOON_MANILA), null);
    assert.equal(milestoneDateIssue("2027-01-01", NOON_MANILA), null);
  });

  test("uses the Manila date, not the UTC date, in the early hours", () => {
    // UTC says 2026-10-11, Manila says 2026-10-12: the 11th is already past.
    assert.equal(milestoneDateIssue("2026-10-11", EARLY_MANILA), MILESTONE_DATE_PAST_MESSAGE);
    assert.equal(milestoneDateIssue("2026-10-12", EARLY_MANILA), null);
  });

  test("the Manila midnight boundary", () => {
    assert.equal(milestoneDateIssue("2026-10-12", LATE_MANILA), null);
    assert.equal(milestoneDateIssue("2026-10-12", MIDNIGHT_MANILA), MILESTONE_DATE_PAST_MESSAGE);
    assert.equal(milestoneDateIssue("2026-10-13", MIDNIGHT_MANILA), null);
  });

  test("anything that is not an ISO date is refused", () => {
    assert.equal(milestoneDateIssue("12/10/2026", NOON_MANILA), "Use a YYYY-MM-DD date");
    assert.equal(milestoneDateIssue("", NOON_MANILA), "Use a YYYY-MM-DD date");
  });
});

describe("redateIssue", () => {
  test("re-sending the stored past date is fine, and so is no date at all", () => {
    assert.equal(redateIssue("2026-09-01", "2026-09-01", NOON_MANILA), null);
    assert.equal(redateIssue(undefined, "2026-09-01", NOON_MANILA), null);
  });

  test("moving to a new past date is refused; moving to today or later is allowed", () => {
    assert.equal(redateIssue("2026-09-15", "2026-09-01", NOON_MANILA), MILESTONE_DATE_PAST_MESSAGE);
    assert.equal(redateIssue("2026-10-12", "2026-09-01", NOON_MANILA), null);
    assert.equal(redateIssue("2026-12-01", null, NOON_MANILA), null);
    assert.equal(redateIssue("2026-09-15", null, NOON_MANILA), MILESTONE_DATE_PAST_MESSAGE);
  });
});

describe("createMilestoneSchema", () => {
  afterEach(() => mock.timers.reset());

  const parse = (estimatedCompletionDate?: string) =>
    createMilestoneSchema.safeParse({ projectCode: "P-1", title: "Slab", estimatedCompletionDate });

  test("rejects a past date with a message on the date field", () => {
    mock.timers.enable({ apis: ["Date"], now: NOON_MANILA });
    const result = parse("2026-10-11");
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.path.join("."), "estimatedCompletionDate");
      assert.equal(result.error.issues[0]?.message, MILESTONE_DATE_PAST_MESSAGE);
    }
  });

  test("accepts today, a future date, and no date", () => {
    mock.timers.enable({ apis: ["Date"], now: NOON_MANILA });
    assert.equal(parse("2026-10-12").success, true);
    assert.equal(parse("2026-11-30").success, true);
    assert.equal(parse(undefined).success, true);
  });

  test("Manila 02:00: yesterday-in-Manila is rejected even though UTC is a day behind", () => {
    mock.timers.enable({ apis: ["Date"], now: EARLY_MANILA });
    assert.equal(parse("2026-10-11").success, false);
    assert.equal(parse("2026-10-12").success, true);
  });
});

describe("updateMilestoneSchema", () => {
  test("still accepts a stored past date, so renames and completions keep working", () => {
    assert.equal(updateMilestoneSchema.safeParse({ title: "Renamed", estimatedCompletionDate: "2020-01-01" }).success, true);
    assert.equal(updateMilestoneSchema.safeParse({ status: "completed" }).success, true);
  });
});
