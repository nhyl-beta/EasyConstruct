import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { createPurchaseRequestSchema, manilaToday, updatePurchaseRequestSchema } from "./validators.js";

const day = (offset: number) => {
  const d = new Date(`${manilaToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const base = { requirementId: 1, title: "Rebar", category: "Materials", lineItems: [{ description: "Rebar", qty: 1, unit: "ton", unitCost: 10 }] };

describe("purchase request neededBy (B-87)", () => {
  test("yesterday is rejected", () => {
    const r = createPurchaseRequestSchema.safeParse({ ...base, neededBy: day(-1) });
    assert.equal(r.success, false);
    assert.match(JSON.stringify(r.error?.issues), /cannot be in the past/);
  });

  test("today and later are accepted, and so is leaving it out", () => {
    assert.equal(createPurchaseRequestSchema.safeParse({ ...base, neededBy: day(0) }).success, true);
    assert.equal(createPurchaseRequestSchema.safeParse({ ...base, neededBy: day(30) }).success, true);
    assert.equal(createPurchaseRequestSchema.safeParse(base).success, true);
  });

  test("an edit that carries an old saved date is not blocked by the raise rule", () => {
    assert.equal(updatePurchaseRequestSchema.safeParse({ neededBy: day(-5) }).success, true);
  });
});
