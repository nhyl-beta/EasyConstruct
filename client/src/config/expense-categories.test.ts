import { describe, expect, it } from "vitest";

import { expenseCategoryForRequirement } from "./expense-categories";

const LIST = ["Materials", "Labor", "Equipment", "PPE", "Transport", "Services", "Concrete works"];

describe("expenseCategoryForRequirement", () => {
  it("maps keywords to the matching category in the live list", () => {
    expect(expenseCategoryForRequirement("Building materials", LIST)).toBe("Materials");
    expect(expenseCategoryForRequirement("Heavy machine hire", LIST)).toBe("Equipment");
    expect(expenseCategoryForRequirement("Safety gear", LIST)).toBe("PPE");
    expect(expenseCategoryForRequirement("Haulage", LIST)).toBe("Transport");
    expect(expenseCategoryForRequirement("Subcontract work", LIST)).toBe("Services");
  });

  it("matches a category added by Finance, ignoring case", () => {
    expect(expenseCategoryForRequirement("concrete WORKS", LIST)).toBe("Concrete works");
  });

  it("returns the list's own casing for a direct match", () => {
    expect(expenseCategoryForRequirement("materials", LIST)).toBe("Materials");
  });

  it("returns '' when the mapped name is not in the list (retired or missing)", () => {
    expect(expenseCategoryForRequirement("Building materials", ["Equipment"])).toBe("");
    expect(expenseCategoryForRequirement("Safety gear", [])).toBe("");
  });

  it("returns '' when nothing maps", () => {
    expect(expenseCategoryForRequirement("Something else", LIST)).toBe("");
  });
});
