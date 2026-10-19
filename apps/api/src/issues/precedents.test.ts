import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { rankPrecedents, type PrecedentCandidate, type PrecedentSubject } from "./precedents.js";

const subject: PrecedentSubject = {
  id: 100,
  title: "Cracks on concrete slab surface",
  description: "Hairline cracks appeared on the warehouse concrete slab after curing",
  category: "Quality",
};

const cand = (over: Partial<PrecedentCandidate>): PrecedentCandidate => ({
  id: 1,
  issueCode: "ISS-1",
  projectCode: "PRJ-1",
  title: subject.title,
  description: subject.description,
  category: "Quality",
  resolutionNotes: "Applied crack injection and extended curing.",
  updatedAt: new Date("2026-09-01"),
  ...over,
});

describe("rankPrecedents", () => {
  test("identical text ranks above same-category partial match above different-category partial", () => {
    const result = rankPrecedents(subject, [
      cand({ id: 3, issueCode: "ISS-3", category: "Material", title: "Concrete slab surface cracks", description: "Cracks on the slab after curing" }),
      cand({ id: 2, issueCode: "ISS-2", category: "Quality", title: "Concrete slab surface cracks", description: "Cracks on the slab after curing" }),
      cand({ id: 1, issueCode: "ISS-1" }),
    ], 3);
    assert.deepEqual(result.map((r) => r.issueCode), ["ISS-1", "ISS-2", "ISS-3"]);
  });

  test("drops candidates under the similarity floor, even in the same category", () => {
    const result = rankPrecedents(subject, [
      cand({ id: 5, title: "Delayed delivery of tiles", description: "Supplier missed the agreed date", category: "Quality" }),
    ]);
    assert.deepEqual(result, []);
  });

  test("returns at most two, skips itself and notes-less candidates", () => {
    const result = rankPrecedents(subject, [
      cand({ id: 100, issueCode: "ISS-SELF" }),
      cand({ id: 7, issueCode: "ISS-7", resolutionNotes: "  " }),
      cand({ id: 8, issueCode: "ISS-8" }),
      cand({ id: 9, issueCode: "ISS-9" }),
      cand({ id: 10, issueCode: "ISS-10" }),
    ]);
    assert.equal(result.length, 2);
    assert.ok(!result.some((r) => r.issueCode === "ISS-SELF" || r.issueCode === "ISS-7"));
  });

  test("ties break on the lower id regardless of input order", () => {
    const a = cand({ id: 20, issueCode: "ISS-20" });
    const b = cand({ id: 11, issueCode: "ISS-11" });
    assert.equal(rankPrecedents(subject, [a, b])[0]?.issueCode, "ISS-11");
    assert.equal(rankPrecedents(subject, [b, a])[0]?.issueCode, "ISS-11");
  });

  test("score is capped at 1 and rounded", () => {
    const top = rankPrecedents(subject, [cand({})])[0];
    assert.equal(top?.score, 1);
  });
});
