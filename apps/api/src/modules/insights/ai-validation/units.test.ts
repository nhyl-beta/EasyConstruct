import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeUnit, convertQuantity } from "./units.js";

describe("normalizeUnit", () => {
  test("area aliases", () => {
    for (const alias of ["sqm", "m2", "m²".replace("²", "2"), "sq meter", "square meters"]) {
      assert.equal(normalizeUnit(alias)?.canonical, "sqm", alias);
    }
    for (const alias of ["sq ft", "sqft", "sf", "square foot", "SQ. FT."]) {
      assert.equal(normalizeUnit(alias)?.canonical, "sqft", alias);
    }
  });

  test("length aliases", () => {
    for (const alias of ["m", "meter", "meters"]) {
      assert.equal(normalizeUnit(alias)?.canonical, "m", alias);
    }
    for (const alias of ["lf", "ln ft", "linear foot", "ft", "feet"]) {
      assert.equal(normalizeUnit(alias)?.canonical, "lf", alias);
    }
  });

  test("volume aliases", () => {
    for (const alias of ["cy", "cu yd", "cubic yard", "cubic yards"]) {
      assert.equal(normalizeUnit(alias)?.canonical, "cy", alias);
    }
    for (const alias of ["m3", "cu m", "cubic meter"]) {
      assert.equal(normalizeUnit(alias)?.canonical, "m3", alias);
    }
  });

  test("mass aliases", () => {
    assert.equal(normalizeUnit("kg")?.canonical, "kg");
    assert.equal(normalizeUnit("lb")?.canonical, "lb");
    assert.equal(normalizeUnit("lbs")?.canonical, "lb");
  });

  test("count aliases", () => {
    for (const alias of ["each", "ea", "pc", "pcs"]) {
      assert.equal(normalizeUnit(alias)?.canonical, "each", alias);
    }
  });

  test("unrecognized unit returns null", () => {
    assert.equal(normalizeUnit("furlong"), null);
    assert.equal(normalizeUnit(""), null);
  });
});

describe("convertQuantity", () => {
  test("identity conversion within the same canonical unit", () => {
    assert.equal(convertQuantity(10, "sqft", "sq ft"), 10);
  });

  test("sqm -> sqft uses the exact factor", () => {
    const result = convertQuantity(1, "sqm", "sqft");
    assert.ok(result !== null);
    assert.ok(Math.abs(result! - 10.7639) < 1e-6);
  });

  test("m -> lf uses the exact factor", () => {
    const result = convertQuantity(1, "m", "lf");
    assert.ok(result !== null);
    assert.ok(Math.abs(result! - 3.28084) < 1e-6);
  });

  test("m3 -> cy uses the exact factor", () => {
    const result = convertQuantity(1, "m3", "cy");
    assert.ok(result !== null);
    assert.ok(Math.abs(result! - 1.30795) < 1e-6);
  });

  test("kg -> lb uses the exact factor", () => {
    const result = convertQuantity(1, "kg", "lb");
    assert.ok(result !== null);
    assert.ok(Math.abs(result! - 2.20462) < 1e-6);
  });

  test("conversion is reversible within floating-point tolerance", () => {
    const converted = convertQuantity(5, "sqm", "sqft")!;
    const back = convertQuantity(converted, "sqft", "sqm")!;
    assert.ok(Math.abs(back - 5) < 1e-6);
  });

  test("cross-family conversion is not comparable", () => {
    assert.equal(convertQuantity(10, "sqft", "kg"), null);
    assert.equal(convertQuantity(10, "m", "sqm"), null);
  });

  test("unrecognized units are not comparable", () => {
    assert.equal(convertQuantity(10, "sqft", "furlong"), null);
    assert.equal(convertQuantity(10, "banana", "sqft"), null);
  });
});
