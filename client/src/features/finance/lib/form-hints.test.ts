import { describe, expect, it } from "vitest";

import { missingForBudget, missingForExpense, missingSentence } from "./form-hints";

describe("missingForExpense", () => {
  it("lists everything missing from an empty form", () => {
    expect(missingForExpense({ vendor: "", project: "", category: "", amount: "" })).toEqual(["a vendor", "a project", "a category", "an amount greater than 0"]);
  });
  it("an amount of 0 or a negative one is still missing", () => {
    expect(missingForExpense({ vendor: "V", project: "P", category: "C", amount: "0" })).toEqual(["an amount greater than 0"]);
    expect(missingForExpense({ vendor: "V", project: "P", category: "C", amount: "-5" })).toEqual(["an amount greater than 0"]);
  });
  it("a complete form misses nothing", () => {
    expect(missingForExpense({ vendor: "V", project: "P", category: "C", amount: "15000" })).toEqual([]);
  });
});

describe("missingForBudget", () => {
  it("needs project, category, owner, planned amount and a four-digit year", () => {
    expect(missingForBudget({ project: "", category: "", owner: " ", planned: "", fiscalYear: "26" })).toEqual([
      "a project",
      "a category",
      "an owner",
      "a planned amount (0 or more)",
      "a four-digit fiscal year",
    ]);
    expect(missingForBudget({ project: "P", category: "C", owner: "O", planned: "0", fiscalYear: "2026" })).toEqual([]);
  });
});

describe("missingSentence", () => {
  it("reads as a sentence", () => {
    expect(missingSentence([])).toBeNull();
    expect(missingSentence(["a vendor"])).toBe("Add a vendor to continue.");
    expect(missingSentence(["a vendor", "a project", "an amount greater than 0"])).toBe("Add a vendor, a project and an amount greater than 0 to continue.");
  });
});
