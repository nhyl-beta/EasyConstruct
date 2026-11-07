import { describe, expect, it } from "vitest";
import { validateBlueprintForm } from "./blueprint-form";

const ok = { drawingNumber: "A-101", folder: "Architectural", title: "Ground Floor Plan", author: "Juan" };

describe("validateBlueprintForm (B-205)", () => {
  it("accepts a complete form", () => {
    expect(validateBlueprintForm(ok)).toEqual({});
  });
  it("names the field in each message", () => {
    expect(validateBlueprintForm({ ...ok, title: "A" }).title).toBe("Title must be at least 2 characters");
    expect(validateBlueprintForm({ ...ok, author: "" }).author).toBe("Author is required");
    expect(validateBlueprintForm({ ...ok, drawingNumber: " " }).drawingNumber).toBe("Drawing number is required");
  });
  it("marks only the fields that are wrong", () => {
    expect(Object.keys(validateBlueprintForm({ ...ok, folder: "", title: "x" })).sort()).toEqual(["folder", "title"]);
  });
  it("refuses over-long values", () => {
    expect(validateBlueprintForm({ ...ok, drawingNumber: "x".repeat(51) }).drawingNumber).toMatch(/at most 50/);
  });
});
