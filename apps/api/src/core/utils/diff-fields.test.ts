import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { diffFields, displayValue, formatChanges } from "./diff-fields.js";

describe("diffFields", () => {
  test("lists only the fields that changed, old to new", () => {
    const changes = diffFields({ name: "A", pm: "Ann", risk: "Low" }, { name: "A", pm: "Bo", risk: "High" });
    assert.deepEqual(changes, [
      { field: "pm", from: "Ann", to: "Bo" },
      { field: "risk", from: "Low", to: "High" },
    ]);
  });
  test("an unchanged field is skipped, including a number against its numeric-column string", () => {
    assert.deepEqual(diffFields({ contractValue: "5000000.00", due: "2026-01-01" }, { contractValue: 5000000, due: "2026-01-01" }), []);
  });
  test("empty to a value and a value to empty are changes", () => {
    const changes = diffFields({ location: null }, { location: "Cebu" });
    assert.deepEqual(changes, [{ field: "location", from: "(empty)", to: "Cebu" }]);
    assert.deepEqual(diffFields({ location: "Cebu" }, { location: "" }), [{ field: "location", from: "Cebu", to: "(empty)" }]);
  });
  test("secret-looking fields are never logged, even when they changed", () => {
    const changes = diffFields({ password: "a", apiToken: "x", name: "A" }, { password: "b", apiToken: "y", name: "B" });
    assert.deepEqual(changes.map((c) => c.field), ["name"]);
  });
  test("ignored fields are skipped; fields the caller did not send are not compared", () => {
    assert.deepEqual(diffFields({ a: 1, b: 2 }, { b: 3 }, { ignore: ["b"] }), []);
    assert.deepEqual(diffFields({ a: 1, b: 2 }, { a: 1 }), []);
  });
  test("long values are shortened and the line reads old -> new", () => {
    assert.ok(displayValue("x".repeat(500)).length <= 80);
    assert.equal(formatChanges([{ field: "pm", from: "Ann", to: "Bo" }]), "pm: Ann → Bo");
  });
});
