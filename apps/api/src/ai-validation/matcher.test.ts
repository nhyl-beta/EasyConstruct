import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { tokenize, dice, bestMatch } from "./matcher.js";
import type { ReferenceSnapshotRow } from "../db/schema/ai-validation.js";

const makeItem = (overrides: Partial<ReferenceSnapshotRow>): ReferenceSnapshotRow => ({
  id: 1,
  source: "estimationpro",
  sourceItemId: "test-item",
  trade: "concrete",
  description: "Rebar installation, #4 bar",
  unit: "linear ft",
  lowUsd: "0.40",
  typicalUsd: "0.65",
  highUsd: "1.00",
  regionMultiplier: "1.000",
  volatility: "volatile",
  currency: "USD",
  sourceUrl: null,
  rawPayload: null,
  fetchedAt: new Date(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...(overrides as any),
});

describe("tokenize", () => {
  test("lowercases, strips punctuation, drops stopwords", () => {
    assert.deepEqual(tokenize("Rebar, #4 bar (installed)"), ["rebar", "4", "bar", "installed"]);
  });

  test("keeps numeric-prefixed tokens intact", () => {
    assert.deepEqual(tokenize("12mm plywood sheet"), ["12mm", "plywood", "sheet"]);
  });

  test("empty or stopword-only text tokenizes to nothing", () => {
    assert.deepEqual(tokenize("the of and"), []);
    assert.deepEqual(tokenize(""), []);
  });
});

describe("dice", () => {
  test("identical strings score 1", () => {
    assert.equal(dice("rebar installation", "rebar installation"), 1);
  });

  test("completely disjoint strings score 0", () => {
    assert.equal(dice("rebar installation", "paint interior labor"), 0);
  });

  test("partial overlap scores strictly between 0 and 1", () => {
    const score = dice("rebar installation #4 bar", "rebar #4 bar delivered");
    assert.ok(score > 0 && score < 1);
  });

  test("empty input scores 0, not NaN", () => {
    assert.equal(dice("", "rebar"), 0);
    assert.equal(dice("rebar", ""), 0);
  });
});

describe("bestMatch", () => {
  const items = [
    makeItem({ id: 1, description: "Rebar installation, #4 bar" }),
    makeItem({ id: 2, description: "Ready-mix concrete (3000-4000 PSI), delivered" }),
    makeItem({ id: 3, description: "Rebar #3 (3/8 inch)" }),
  ];

  test("returns the closest description above the floor", () => {
    const match = bestMatch("Rebar #4 bar installation", items);
    assert.ok(match !== null);
    assert.equal(match!.item.id, 1);
  });

  test("nonsense input returns null (below the 0.40 floor)", () => {
    assert.equal(bestMatch("asdf 123", items), null);
  });

  test("no items at all returns null", () => {
    assert.equal(bestMatch("Rebar installation", []), null);
  });

  test("ties break deterministically on the lower id", () => {
    const tied = [
      makeItem({ id: 20, description: "Rebar installation" }),
      makeItem({ id: 5, description: "Rebar installation" }),
    ];
    const match = bestMatch("Rebar installation", tied);
    assert.equal(match!.item.id, 5);
  });
});
