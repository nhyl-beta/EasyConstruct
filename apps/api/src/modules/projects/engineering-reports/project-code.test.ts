import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveProjectCode } from "./project-code.js";

const codes = ["Zh-01", "DEMO-STAGE-4", "WGT-2026-001"];

describe("resolveProjectCode", () => {
  test("an exact code is returned as is", () => {
    assert.equal(resolveProjectCode("Zh-01", codes), "Zh-01");
    assert.equal(resolveProjectCode("DEMO-STAGE-4", codes), "DEMO-STAGE-4");
  });

  test("a code with different letter case resolves to the stored code", () => {
    assert.equal(resolveProjectCode("ZH-01", codes), "Zh-01");
    assert.equal(resolveProjectCode("demo-stage-4", codes), "DEMO-STAGE-4");
  });

  test("surrounding spaces are ignored", () => {
    assert.equal(resolveProjectCode("  ZH-01 ", codes), "Zh-01");
  });

  test("an unknown or empty code resolves to nothing", () => {
    assert.equal(resolveProjectCode("NOPE-1", codes), null);
    assert.equal(resolveProjectCode("   ", codes), null);
  });

  test("an ambiguous case-insensitive match is refused rather than guessed", () => {
    assert.equal(resolveProjectCode("ab-1", ["AB-1", "Ab-1"]), null);
    assert.equal(resolveProjectCode("AB-1", ["AB-1", "Ab-1"]), "AB-1");
  });
});
