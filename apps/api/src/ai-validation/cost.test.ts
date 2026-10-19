import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { compareLineItem, type LineItemForCost, type FxRate } from "./cost.js";
import type { MatchResult } from "./matcher.js";
import type { ReferenceSnapshotRow } from "../db/schema/ai-validation.js";

const FX: FxRate = { rate: 62.73, asOf: "2026-09-22" };

const makeItem = (overrides: Partial<ReferenceSnapshotRow>): ReferenceSnapshotRow => ({
  id: 1,
  source: "estimationpro",
  sourceItemId: "rebar-4",
  trade: "concrete",
  description: "Rebar installation, #4 bar",
  unit: "linear ft",
  lowUsd: "80",
  typicalUsd: "100",
  highUsd: "120",
  regionMultiplier: "1.000",
  volatility: "volatile",
  currency: "USD",
  sourceUrl: "https://estimationpro.ai/api",
  rawPayload: null,
  fetchedAt: new Date("2026-09-22T00:00:00Z"),
  ...overrides,
});

const baseLine = (overrides: Partial<LineItemForCost> = {}): LineItemForCost => ({
  id: 1,
  workflowId: 10,
  projectCode: "TEST-001",
  description: "Rebar installation, #4 bar",
  requestedAmount: 850000,
  quantity: 128.5,
  unit: "linear ft",
  ...overrides,
});

describe("compareLineItem — Field Guide worked trace", () => {
  test("typical total $12,850 -> ~₱806,081 -> +5.4% -> within-range", () => {
    const item = makeItem({});
    const match: MatchResult = { item, score: 0.62 };
    const line = baseLine();

    const result = compareLineItem(line, match, FX);

    assert.equal(result.verdict, "within-range");
    assert.equal(Number(result.referenceMidUsd), 12850);
    assert.ok(Math.abs(Number(result.referenceMidPhp) - 806080.5) < 0.01);
    assert.ok(Math.abs(Number(result.variancePct)! - 0.054484) < 0.001);
    assert.match(result.basisSummary, /EstimationPro\.ai/);
    assert.match(result.basisSummary, /₱806,081/);
    assert.match(result.basisSummary, /\+5\.4%/);
  });

  test("above typical when the requested amount is far over the reference range", () => {
    const item = makeItem({});
    const match: MatchResult = { item, score: 0.62 };
    const line = baseLine({ requestedAmount: 1_200_000 });

    const result = compareLineItem(line, match, FX);
    assert.equal(result.verdict, "above-typical");
    assert.match(result.basisSummary, /\+\d/);
  });

  test("below typical when the requested amount is far under the reference range", () => {
    const item = makeItem({});
    const match: MatchResult = { item, score: 0.62 };
    const line = baseLine({ requestedAmount: 300_000 });

    const result = compareLineItem(line, match, FX);
    assert.equal(result.verdict, "below-typical");
  });
});

describe("compareLineItem — no-match reasons", () => {
  test("no quantity", () => {
    const line = baseLine({ quantity: null });
    const result = compareLineItem(line, null, FX);
    assert.equal(result.verdict, "no-match");
    assert.match(result.basisSummary, /no quantity/);
  });

  test("no unit", () => {
    const line = baseLine({ unit: null });
    const result = compareLineItem(line, null, FX);
    assert.equal(result.verdict, "no-match");
    assert.match(result.basisSummary, /no unit/);
  });

  test("no catalog match", () => {
    const line = baseLine();
    const result = compareLineItem(line, null, FX);
    assert.equal(result.verdict, "no-match");
    assert.match(result.basisSummary, /no catalog item matched/);
  });

  test("units not convertible", () => {
    const item = makeItem({ unit: "kg" });
    const match: MatchResult = { item, score: 0.5 };
    const line = baseLine({ unit: "linear ft" });

    const result = compareLineItem(line, match, FX);
    assert.equal(result.verdict, "no-match");
    assert.match(result.basisSummary, /can't be converted/);
  });

  test("no-match rows carry no range in the summary", () => {
    const line = baseLine({ quantity: null });
    const result = compareLineItem(line, null, FX);
    assert.doesNotMatch(result.basisSummary, /₱/);
    assert.equal(result.referenceLowPhp, null);
    assert.equal(result.referenceHighPhp, null);
  });
});
