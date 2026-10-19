import { describe, expect, it } from "vitest";

import type { ExpenseCategory } from "../types/categories.types";
import { categoryKey, nameProblem } from "./category-name";

const cat = (id: number, name: string, isActive = true): ExpenseCategory => ({ id, name, isActive, isSystem: false, sortOrder: id });
const ALL = [cat(1, "Materials"), cat(2, "Old stuff", false)];

describe("nameProblem", () => {
  it("accepts a new name", () => expect(nameProblem("Concrete works", ALL)).toBeNull());
  it("requires a name of 2 to 64 characters", () => {
    expect(nameProblem("   ", ALL)).toMatch(/Enter a name/);
    expect(nameProblem("a", ALL)).toMatch(/at least 2/);
    expect(nameProblem("x".repeat(65), ALL)).toMatch(/at most 64/);
  });
  it("rejects a duplicate, ignoring case and spacing", () => {
    expect(nameProblem("materials", ALL)).toMatch(/"Materials" already exists/);
    expect(nameProblem("MATERIALS ", ALL)).toMatch(/already exists/);
  });
  it("points at Restore for a retired duplicate", () => expect(nameProblem("old  stuff", ALL)).toMatch(/restore it/));
  it("lets a category keep its own name when renaming", () => expect(nameProblem("materials", ALL, 1)).toBeNull());
});

describe("categoryKey", () => {
  it("is case and space insensitive", () => expect(categoryKey(" Concrete   WORKS")).toBe("concrete works"));
});
