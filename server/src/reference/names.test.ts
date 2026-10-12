import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { findNameMatches, normalizeName } from "./names.js";

describe("normalizeName", () => {
  test("case, punctuation, accents and spacing do not matter", () => {
    assert.equal(normalizeName("  ABC   Steel Supply "), "abc steel supply");
    assert.equal(normalizeName("Café Ñandú Builders"), "cafe nandu builders");
    assert.equal(normalizeName("Harbor-Freight, Corp."), "harbor freight");
  });
  test("trailing company suffixes are dropped, but a name that is only a suffix keeps it", () => {
    assert.equal(normalizeName("GreenPower Inc."), "greenpower");
    assert.equal(normalizeName("GreenPower Incorporated"), "greenpower");
    assert.equal(normalizeName("Inc"), "inc");
  });
  test("ampersand reads as and", () => {
    assert.equal(normalizeName("Santos & Sons"), "santos and sons");
    assert.equal(normalizeName("Santos and Sons"), "santos and sons");
  });
  test("empty input is empty", () => {
    assert.equal(normalizeName("  "), "");
  });
});

describe("findNameMatches", () => {
  const existing = [
    { id: 1, name: "Westgate Health Group" },
    { id: 2, name: "City of Riverside" },
    { id: 3, name: "GreenPower Inc." },
  ];
  test("an identical normalized name is an exact match", () => {
    const m = findNameMatches("greenpower", existing);
    assert.equal(m.length, 1);
    assert.equal(m[0]!.id, 3);
    assert.equal(m[0]!.exact, true);
  });
  test("a close name is similar, not exact", () => {
    const m = findNameMatches("Westgate Health Groups", existing);
    assert.equal(m[0]!.id, 1);
    assert.equal(m[0]!.exact, false);
    assert.ok(m[0]!.score >= 0.85);
  });
  test("an unrelated name matches nothing", () => {
    assert.deepEqual(findNameMatches("Pacific Cement Trading", existing), []);
  });
  test("exact matches come before similar ones", () => {
    const m = findNameMatches("Westgate Health Group", [{ id: 9, name: "Westgate Health Groups" }, { id: 1, name: "Westgate Health Group" }]);
    assert.deepEqual(m.map((x) => x.id), [1, 9]);
  });
  test("a blank candidate matches nothing", () => {
    assert.deepEqual(findNameMatches("  ", existing), []);
  });
});
