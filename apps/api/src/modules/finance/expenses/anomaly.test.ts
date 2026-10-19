import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { median, ratioScore, scoreExpense, type ExpenseLike } from "./anomaly.js";

const at = (d: string) => new Date(`${d}T00:00:00Z`);
const exp = (id: string, over: Partial<ExpenseLike> = {}): ExpenseLike => ({
  id,
  vendor: "Holcim Ready-Mix",
  project: "DEMO-S4",
  category: "Materials",
  amount: 100_000,
  submittedAt: at("2026-09-01"),
  status: "approved",
  ...over,
});

describe("duplicate payment", () => {
  test("same vendor, project and amount within 30 days scores 0.95 and names the original", () => {
    const r = scoreExpense(exp("B", { submittedAt: at("2026-09-10") }), [exp("A")]);
    assert.equal(r.score, 0.95);
    assert.match(r.reasons[0]!, /as A/);
  });
  test("vendor name is compared ignoring case and spacing", () => {
    const r = scoreExpense(exp("B", { vendor: " holcim ready-mix ", submittedAt: at("2026-09-10") }), [exp("A")]);
    assert.equal(r.score, 0.95);
  });
  test("31 days apart is not a duplicate", () => {
    assert.equal(scoreExpense(exp("B", { submittedAt: at("2026-10-05") }), [exp("A")]).score, 0);
  });
  test("a different amount is not a duplicate", () => {
    assert.equal(scoreExpense(exp("B", { amount: 100_001, submittedAt: at("2026-09-05") }), [exp("A")]).score, 0);
  });
  test("same vendor and amount on another project within a week scores 0.7", () => {
    const r = scoreExpense(exp("B", { project: "DEMO-S5", submittedAt: at("2026-09-04") }), [exp("A")]);
    assert.equal(r.score, 0.7);
  });
  test("a rejected earlier payment is not a duplicate; neither is the expense itself", () => {
    assert.equal(scoreExpense(exp("B", { submittedAt: at("2026-09-05") }), [exp("A", { status: "rejected" })]).score, 0);
    assert.equal(scoreExpense(exp("A"), [exp("A")]).score, 0);
  });
});

describe("far above history", () => {
  const vendorHistory = [60_000, 80_000, 100_000, 90_000].map((amount, i) => exp(`H${i}`, { amount, submittedAt: at(`2026-0${i + 1}-15`) }));
  test("ratio to the median maps to a score", () => {
    assert.equal(ratioScore(2.9), 0);
    assert.equal(ratioScore(3), 0.6);
    assert.equal(ratioScore(5), 0.8);
    assert.equal(ratioScore(8), 0.95);
    assert.equal(ratioScore(20), 0.95);
  });
  test("median", () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(median([]), 0);
  });
  test("an amount 5x the vendor's median is flagged with the reason", () => {
    const typical = 85_000; // median of 60,80,90,100
    const r = scoreExpense(exp("X", { amount: typical * 5, submittedAt: at("2026-09-20") }), vendorHistory);
    assert.equal(r.score, 0.8);
    assert.match(r.reasons[0]!, /5\.0× the typical/);
  });
  test("an ordinary amount is clean", () => {
    assert.deepEqual(scoreExpense(exp("X", { amount: 95_000, submittedAt: at("2026-09-20") }), vendorHistory), { score: 0, reasons: [] });
  });
  test("a new vendor falls back to the category (needs 4 peers)", () => {
    const peers = [50_000, 55_000, 60_000, 65_000].map((amount, i) => exp(`C${i}`, { vendor: `Vendor ${i}`, amount }));
    const flagged = scoreExpense(exp("N", { vendor: "Brand New Supply", amount: 400_000, submittedAt: at("2026-09-20") }), peers);
    // 400,000 is about 7x the 57,500 median: between the 5x (0.8) and 8x (0.95) points.
    assert.ok(flagged.score > 0.85 && flagged.score < 0.95, String(flagged.score));
    assert.match(flagged.reasons[0]!, /Materials category/);
    const tooFew = scoreExpense(exp("N", { vendor: "Brand New Supply", amount: 400_000, submittedAt: at("2026-09-20") }), peers.slice(0, 3));
    assert.equal(tooFew.score, 0);
  });
  test("rejected expenses never count as history", () => {
    const rejected = vendorHistory.map((h) => ({ ...h, status: "rejected" }));
    assert.equal(scoreExpense(exp("X", { amount: 500_000 }), rejected).score, 0);
  });
  test("the higher of the two rules wins and both reasons are kept", () => {
    const r = scoreExpense(exp("X", { amount: 425_000, submittedAt: at("2026-09-20") }), [...vendorHistory, exp("D", { amount: 425_000, submittedAt: at("2026-09-18") })]);
    assert.equal(r.score, 0.95);
    assert.equal(r.reasons.length, 2);
  });
});
