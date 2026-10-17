import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOverdueEmail,
  isStageOverdue,
  manilaDay,
  planEmails,
  sentKey,
  stageAgeHours,
  stageOverdueHours,
  uniquePeople,
  type OverdueItem,
  type Person,
} from "./overdue.js";

const item = (id: number, type: OverdueItem["type"] = "rfi"): OverdueItem => ({ type, id, subject: `RFI-${id} Wall type`, detail: "Due 3 days ago", path: `/requests?open=${id}` });
const person = (id: number, over: Partial<Person> = {}): Person => ({ id, name: `User ${id}`, email: `u${id}@example.com`, emailOverdueReminders: true, ...over });

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

describe("once per item per day", () => {
  const day = "2026-10-10";

  test("a person already emailed about an item today is not emailed again", () => {
    const a = person(1);
    const plan = planEmails([{ item: item(5), recipients: [a] }], new Set([sentKey("rfi", 5, 1, day)]), day);
    assert.equal(plan.send.length, 0);
    assert.equal(plan.skippedAlreadySent, 1);
  });

  test("the next day it can be sent again, and a different item is separate", () => {
    const a = person(1);
    const sent = new Set([sentKey("rfi", 5, 1, day)]);
    assert.equal(planEmails([{ item: item(5), recipients: [a] }], sent, "2026-10-11").send.length, 1);
    assert.equal(planEmails([{ item: item(6), recipients: [a] }], sent, day).send.length, 1);
  });

  test("someone who is both assignee and Admin gets one email, not two", () => {
    const a = person(1);
    const plan = planEmails([{ item: item(5), recipients: [a, a, person(2)] }], new Set(), day);
    assert.deepEqual(plan.send.map((s) => s.to.id), [1, 2]);
  });

  test("planning twice from the same sent set never doubles a send", () => {
    const sent = new Set<string>();
    const first = planEmails([{ item: item(5), recipients: [person(1), person(2)] }], sent, day);
    for (const s of first.send) sent.add(sentKey(s.item.type, s.item.id, s.to.id, day));
    const second = planEmails([{ item: item(5), recipients: [person(1), person(2)] }], sent, day);
    assert.equal(first.send.length, 2);
    assert.equal(second.send.length, 0);
  });
});

describe("the per-user setting", () => {
  const day = "2026-10-10";

  test("someone who switched the setting off gets no email", () => {
    const plan = planEmails([{ item: item(5), recipients: [person(1, { emailOverdueReminders: false }), person(2)] }], new Set(), day);
    assert.deepEqual(plan.send.map((s) => s.to.id), [2]);
    assert.equal(plan.skippedOptOut, 1);
  });

  test("someone with no email address is skipped", () => {
    const plan = planEmails([{ item: item(5), recipients: [person(1, { email: null }), person(2, { email: "  " })] }], new Set(), day);
    assert.equal(plan.send.length, 0);
    assert.equal(plan.skippedNoEmail, 2);
  });

  test("uniquePeople keeps the first of a repeated person", () => {
    assert.deepEqual(uniquePeople([person(1), person(2), person(1)]).map((p) => p.id), [1, 2]);
  });
});

describe("day and email text", () => {
  test("the day is the Manila calendar day", () => {
    assert.equal(manilaDay(new Date("2026-10-10T16:30:00Z")), "2026-10-11");
    assert.equal(manilaDay(new Date("2026-10-10T15:30:00Z")), "2026-10-10");
  });

  test("the email names the item, links to it and is safe in HTML", () => {
    const e = buildOverdueEmail({ ...item(5), subject: "RFI <b>5</b>\nBcc: x@y.z", detail: "Due & late" }, "https://app.example.com/");
    assert.doesNotMatch(e.subject, /[\r\n]/);
    assert.ok(e.text.includes("https://app.example.com/requests?open=5"));
    assert.ok(e.html.includes("&lt;b&gt;5&lt;/b&gt;"));
    assert.ok(!e.html.includes("<b>5</b>"));
    assert.ok(e.html.includes("Due &amp; late"));
  });
});
