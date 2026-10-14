import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  VALIDATION_VERSION,
  ensureValidation,
  isCurrentValidation,
  median,
  parseAmount,
  validateProposal,
  type ValidationContext,
} from "./validation.js";

const NOW = new Date("2026-10-12T04:00:00Z");
const FULL =
  "Scope of work: build a two storey office. Schedule: 24 weeks. Cost estimate in PHP. Floor area 800 sqm for tenant use.";
const input = { title: "Warehouse design proposal", content: FULL, amount: "2500000" };

const ctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  projectType: "Commercial",
  contractValue: 5_000_000,
  similarAmounts: [2_000_000, 2_200_000, 2_100_000, 1_900_000, 2_300_000],
  siblings: [],
  now: NOW,
  ...over,
});

describe("amount against similar proposals", () => {
  test("a typical amount raises nothing and records the sample in the basis", () => {
    const r = validateProposal(input, true, "P-1", ctx());
    assert.deepEqual(r.warnings, []);
    assert.ok(r.basis!.some((b) => b.includes("5 past proposals") && b.includes("2,100,000")));
  });

  test("an amount over twice the median is flagged, naming the sample", () => {
    const r = validateProposal({ ...input, amount: "5000000" }, true, "P-1", ctx());
    const w = r.warnings.find((x) => x.includes("times the median"))!;
    assert.ok(w, "expected a high-amount warning");
    assert.match(w, /vs 5 similar proposals, Commercial projects/);
    assert.match(w, /2,100,000/);
  });

  test("a very low amount is flagged too", () => {
    const r = validateProposal({ ...input, amount: "500000" }, true, "P-1", ctx());
    assert.ok(r.warnings.some((x) => x.includes("only 24% of the median")));
  });

  test("too few comparable proposals skips the check and says so", () => {
    const r = validateProposal({ ...input, amount: "9000000" }, true, "P-1", ctx({ similarAmounts: [2_000_000, 2_100_000] }));
    assert.ok(!r.warnings.some((x) => x.includes("median")));
    assert.ok(r.basis!.some((b) => b.includes("Not enough past Commercial proposals")));
  });
});

describe("amount against the contract", () => {
  test("more than the contract value is flagged", () => {
    const r = validateProposal({ ...input, amount: "6000000" }, true, "P-1", ctx({ similarAmounts: [] }));
    assert.ok(r.warnings.some((x) => x.includes("more than the project's contract value PHP 5,000,000")));
  });

  test("no contract value skips it", () => {
    const r = validateProposal({ ...input, amount: "6000000" }, true, "P-1", ctx({ contractValue: null, similarAmounts: [] }));
    assert.ok(!r.warnings.some((x) => x.includes("contract value")));
  });
});

describe("possible duplicates", () => {
  const sibling = (over = {}) => ({
    proposalId: "PRP-7",
    title: "Warehouse design proposal",
    amount: 2_450_000,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...over,
  });

  test("same project, similar title, close amount, recent: flagged", () => {
    const r = validateProposal(input, true, "P-1", ctx({ similarAmounts: [], contractValue: null, siblings: [sibling()] }));
    const w = r.warnings.find((x) => x.startsWith("Possible duplicate"))!;
    assert.ok(w);
    assert.match(w, /PRP-7/);
    assert.match(w, /filed 11 days ago/);
  });

  test("a different title, a far amount or an old filing is not a duplicate", () => {
    for (const s of [
      sibling({ title: "Septic tank rehabilitation works" }),
      sibling({ amount: 900_000 }),
      sibling({ createdAt: new Date("2026-06-01T00:00:00Z") }),
    ]) {
      const r = validateProposal(input, true, "P-1", ctx({ similarAmounts: [], contractValue: null, siblings: [s] }));
      assert.ok(!r.warnings.some((x) => x.startsWith("Possible duplicate")), JSON.stringify(s));
    }
  });
});

describe("required sections by project type", () => {
  test("a description that covers the sections raises nothing", () => {
    const r = validateProposal(input, true, "P-1", ctx({ similarAmounts: [], contractValue: null }));
    assert.deepEqual(r.warnings, []);
  });

  test("missing sections are named with what was looked for", () => {
    const r = validateProposal(
      { ...input, content: "We will build a nice building for you with great quality materials." },
      true,
      "P-1",
      ctx({ similarAmounts: [], contractValue: null }),
    );
    assert.ok(r.warnings.some((x) => x.includes('"Scope of work"')));
    assert.ok(r.warnings.some((x) => x.includes('"Schedule"')));
  });

  test("a type-specific section is required only for that type", () => {
    const text = "Scope of work and schedule of 20 weeks, cost estimate in PHP, nothing else described here.";
    const solar = validateProposal({ ...input, content: text }, true, "P-1", ctx({ projectType: "Renewable Energy", similarAmounts: [], contractValue: null }));
    assert.ok(solar.warnings.some((x) => x.includes('"Capacity"')));
    const unknownType = validateProposal({ ...input, content: text }, true, "P-1", ctx({ projectType: null, similarAmounts: [], contractValue: null }));
    assert.deepEqual(unknownType.warnings, []);
  });

  test("a brief description gets only the brief warning, not a list of missing sections", () => {
    const r = validateProposal({ ...input, content: "Short." }, true, "P-1", ctx({ similarAmounts: [], contractValue: null }));
    assert.equal(r.warnings.filter((x) => x.includes("very brief")).length, 1);
    assert.ok(!r.warnings.some((x) => x.includes("does not seem to cover")));
  });
});

describe("compatibility and versions", () => {
  test("the original fields are unchanged and the new ones are additions", () => {
    const r = validateProposal(input, true, "P-1", ctx());
    assert.equal(r.passed, true);
    assert.deepEqual(r.issues, []);
    assert.equal(typeof r.checkedAt, "string");
    assert.equal(r.version, VALIDATION_VERSION);
    assert.ok(Array.isArray(r.basis));
  });

  test("works with no context at all, like the original", () => {
    const r = validateProposal({ title: "Hi", content: "", amount: "" }, false, "X");
    assert.equal(r.passed, false);
    assert.ok(r.issues.length >= 2);
  });

  test("a stored version-1 result is recomputed; a current one is not", () => {
    const v1 = JSON.stringify({ passed: true, issues: [], warnings: [], checkedAt: "2026-01-01T00:00:00Z" });
    assert.equal(isCurrentValidation(v1), false);
    const upgraded = ensureValidation({ ...input, projectCode: "P-1", aiValidation: v1 }, true, ctx());
    assert.equal(upgraded.changed, true);
    assert.equal(JSON.parse(upgraded.aiValidation).version, VALIDATION_VERSION);

    const again = ensureValidation({ ...input, projectCode: "P-1", aiValidation: upgraded.aiValidation }, true, ctx());
    assert.equal(again.changed, false);
    assert.equal(again.aiValidation, upgraded.aiValidation);
  });

  test("unparseable stored text is left alone", () => {
    assert.equal(isCurrentValidation("not json"), true);
  });
});

test("helpers", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(parseAmount("PHP 1,500,000"), 1_500_000);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount(null), null);
});
