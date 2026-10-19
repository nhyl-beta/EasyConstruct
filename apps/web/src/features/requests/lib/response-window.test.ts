import { describe, expect, it } from "vitest";

import { responseWindowProblem } from "./response-window";

describe("responseWindowProblem", () => {
  it("empty is fine (the default applies)", () => {
    expect(responseWindowProblem("")).toBeNull();
    expect(responseWindowProblem("  ")).toBeNull();
  });
  it("1 to 60 whole days is fine", () => {
    for (const v of ["1", "3", "60"]) expect(responseWindowProblem(v), v).toBeNull();
  });
  it("anything else names the field and the range", () => {
    for (const v of ["0", "61", "-2", "2.5", "abc", "1e3"]) expect(responseWindowProblem(v), v).toMatch(/Response window.*1 to 60/);
  });
});
