import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EVENT_KINDS, isEventAction, isEventKind, summarizeEvents } from "./summary.js";

describe("summarizeEvents", () => {
  test("acceptance rate is accepted over answered; accepted of shown is separate", () => {
    const out = summarizeEvents([
      { kind: "assignee", action: "shown", count: 10 },
      { kind: "assignee", action: "accepted", count: 3 },
      { kind: "assignee", action: "dismissed", count: 1 },
    ]);
    const a = out.find((k) => k.kind === "assignee")!;
    assert.equal(a.shown, 10);
    assert.equal(a.acceptanceRate, 75);
    assert.equal(a.acceptedOfShown, 30);
  });

  test("a kind with nothing recorded has no rate rather than 0 or NaN", () => {
    const out = summarizeEvents([]);
    assert.equal(out.length, EVENT_KINDS.length);
    for (const k of out) {
      assert.equal(k.acceptanceRate, null);
      assert.equal(k.acceptedOfShown, null);
      assert.equal(k.shown, 0);
    }
  });

  test("shown but never answered: no acceptance rate, accepted of shown is 0", () => {
    const k = summarizeEvents([{ kind: "finding", action: "shown", count: 4 }]).find((x) => x.kind === "finding")!;
    assert.equal(k.acceptanceRate, null);
    assert.equal(k.acceptedOfShown, 0);
  });

  test("counts for the same kind and action are added, unknown kinds are ignored", () => {
    const out = summarizeEvents([
      { kind: "plan-item", action: "accepted", count: 2 },
      { kind: "plan-item", action: "accepted", count: 3 },
      { kind: "mystery", action: "accepted", count: 99 },
    ]);
    assert.equal(out.find((k) => k.kind === "plan-item")!.accepted, 5);
    assert.ok(!out.some((k) => (k.kind as string) === "mystery"));
  });

  test("rates are rounded to one decimal", () => {
    const k = summarizeEvents([
      { kind: "allocation", action: "accepted", count: 1 },
      { kind: "allocation", action: "dismissed", count: 2 },
    ]).find((x) => x.kind === "allocation")!;
    assert.equal(k.acceptanceRate, 33.3);
  });
});

test("guards", () => {
  assert.equal(isEventKind("assignee"), true);
  assert.equal(isEventKind("nope"), false);
  assert.equal(isEventAction("shown"), true);
  assert.equal(isEventAction("deleted"), false);
});
